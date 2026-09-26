// middleware/lib/configProtocol.js
//
// Generic, module-agnostic request/response lifecycle protocol for
// Dashboard <-> Middleware <-> Bot configuration operations. This is the
// ONLY way any module talks to a bot in this codebase — there is no
// fire-and-forget legacy path left.
//
// Wire contract
// -------------
// Middleware -> Bot        event: 'config:dispatch'
//   { requestId, botId, serverId, userId, module, action, payload, timestamp }
//
// Bot -> Middleware         event: 'config:ack'
//   { requestId, botId, serverId, module, action, state, message, data, error, timestamp }
//   state ∈ 'received' | 'processing' | 'success' | 'failed'
//
// Middleware -> Dashboard   event: 'config:event'
//   { requestId, module, action, serverId, botId, state, message, data, error,
//     version, sequence, timestamp }
//   state ∈ 'sending' | 'received' | 'processing' | 'success' | 'failed' | 'timeout' | 'conflict'
//
// Design goals: no blocking I/O, bounded memory, safe under duplicate/
// out-of-order delivery, automatic cleanup, and resilience to bot
// disconnects / middleware restarts. This class has zero knowledge of any
// specific module (quarantine, welcome, tickets, ...) — it is purely
// plumbing. Modules opt in declaratively via lib/moduleRegistry.js.
//
// Resilience features added in v2:
//   - `sequence`: monotonic per (module, serverId) counter stamped on every
//     successful write, so dashboards can drop stale/out-of-order UI events.
//   - `version`/`expectedVersion`: optimistic concurrency. If a dashboard's
//     mutation was built against config version N but the server-side
//     authoritative version has since moved to N+1 (another editor, or the
//     bot mutated it itself), the write is rejected with state 'conflict'
//     instead of silently clobbering newer data.
//   - `idempotent` dispatch flag: on timeout, idempotent actions are retried
//     exactly once automatically before surfacing a failure to the client.
//   - integrates with lib/moduleState.js (authoritative cache + versioning)
//     and lib/requestLog.js (latency/failure metrics + ring-buffer log).

const crypto = require('crypto');
const moduleState = require('./moduleState');
const requestLog = require('./requestLog');

const DEFAULT_TIMEOUT_MS = 15000;
// Hard ceiling on total operation time regardless of how many keep-alive
// acks arrive — a genuinely stuck/looping bot handler must still fail
// instead of hanging the dashboard forever. The bot pings a 'processing'
// ack every ~5s while a handler is running (see Bot/dashboard/lib/configBus.js
// HANDLER_HEARTBEAT_MS), which comfortably clears this ceiling for any
// legitimate multi-step setup (role/channel creation, permission edits, ...).
const MAX_TOTAL_TIMEOUT_MS = 3 * 60 * 1000;
const COMPLETED_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const COMPLETED_CACHE_MAX = 2000;
const SWEEP_INTERVAL_MS = 30000;
const STALE_PENDING_MULTIPLIER = 5; // safety net if a setTimeout is somehow lost

const TERMINAL_STATES = new Set(['success', 'failed', 'timeout', 'conflict']);

function randomId() {
    return crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

class ConfigProtocol {
    constructor({ io, logger = console } = {}) {
        if (!io) throw new Error('ConfigProtocol requires a socket.io server instance');
        this.io = io;
        this.logger = logger;

        /** @type {Map<string, object>} requestId -> pending entry */
        this.pending = new Map();

        /** @type {Map<string, {completedAt:number}>} requestId -> idempotency marker */
        this.completed = new Map();

        /** @type {Map<string, number>} "module:serverId" -> last sequence number */
        this.sequences = new Map();

        this._sweepTimer = setInterval(() => this._sweep(), SWEEP_INTERVAL_MS);
        if (this._sweepTimer.unref) this._sweepTimer.unref();
    }

    // ─── Public API ──────────────────────────────────────────────────

    /**
     * Dispatch a configuration operation to a bot and resolve once a
     * terminal ack (success/failed/timeout/conflict) arrives. Emits
     * progress events to the dashboard rooms along the way.
     *
     * @param {object} opts
     * @param {string} opts.botSocketId   target bot's socket.io connection id
     * @param {string} opts.botId         bot's discord client id (for envelopes)
     * @param {string} opts.serverId      guild id this operation targets
     * @param {string} opts.userId        bot owner's id (routes to user_{userId} room)
     * @param {string} opts.module        module name, e.g. 'quarantine'
     * @param {string} opts.action        action name, e.g. 'setup'
     * @param {object} [opts.payload]     arbitrary action payload
     * @param {number} [opts.timeoutMs]   per-request timeout override
     * @param {boolean} [opts.idempotent] if true, a timeout triggers exactly one automatic retry
     * @param {number} [opts.expectedVersion] optimistic-concurrency guard; omit to skip the check
     * @returns {Promise<{success:boolean, state:string, data:any, message:?string, error:?string, requestId:string, version:?number, sequence:?number}>}
     */
    async dispatch(opts) {
        const { serverId, module: moduleName, expectedVersion, stateKey = moduleName } = opts;

        // Optimistic concurrency: reject stale writes before ever bothering
        // the bot. The dashboard should refetch and retry with fresh data.
        if (!moduleState.isVersionCurrent(stateKey, serverId, expectedVersion)) {
            const current = moduleState.get(stateKey, serverId);
            return {
                success: false,
                state: 'conflict',
                data: current?.data ?? null,
                message: 'Configuration changed since you last loaded it. Latest data attached — please retry.',
                error: 'version_conflict',
                requestId: null,
                version: current?.version ?? null,
                sequence: null
            };
        }

        return this._dispatchOnce(opts, 0);
    }

    _dispatchOnce(opts, retryCount) {
        const {
            botSocketId, botId, serverId, userId, module: moduleName, action,
            payload = {}, timeoutMs = DEFAULT_TIMEOUT_MS, idempotent = false,
            stateKey = moduleName
        } = opts;

        const requestId = randomId();
        const timestamp = Date.now();

        requestLog.start({ requestId, module: moduleName, action, serverId, botId });

        return new Promise((resolve) => {
            const entry = {
                requestId, botId, serverId, userId, module: moduleName, action, stateKey,
                botSocketId, state: 'sending', createdAt: timestamp,
                idempotent, retryCount, originalOpts: opts, timeoutMs,
                hasProgressed: false,
                resolve, timeout: null
            };

            entry.timeout = setTimeout(() => this._handleTimeout(requestId), timeoutMs);
            if (entry.timeout.unref) entry.timeout.unref();
            this.pending.set(requestId, entry);

            // Tell the bot to perform the work.
            this.io.to(botSocketId).emit('config:dispatch', {
                requestId, botId, serverId, userId, module: moduleName, action, payload, timestamp
            });

            // Let every dashboard viewing this server know we've sent it.
            this._emitToDashboard(entry, { state: 'sending', message: retryCount > 0 ? 'Retrying...' : 'Sent to bot, awaiting response...' });
        });
    }

    /**
     * Handle an incoming 'config:ack' event from a bot socket. Safe against
     * duplicates, out-of-order delivery, and unknown requestIds (e.g. after
     * a middleware restart or a very late ack that arrived past timeout).
     */
    handleAck(ackPayload = {}) {
        const { requestId, state } = ackPayload;
        if (!requestId || !state) return;

        const entry = this.pending.get(requestId);

        if (!entry) {
            if (!this.completed.has(requestId)) {
                this.logger.warn?.(`[ConfigProtocol] Ack for unknown requestId ${requestId} (state=${state})`);
            }
            return;
        }

        entry.state = state;

        if (state === 'success') {
            const stateEntry = moduleState.set(entry.stateKey, entry.serverId, ackPayload.data ?? null);
            const sequence = this._nextSequence(entry.stateKey, entry.serverId);

            this._emitToDashboard(entry, {
                state, message: ackPayload.message, data: stateEntry.data,
                version: stateEntry.version, sequence
            });

            this._resolve(entry, {
                success: true, state, data: stateEntry.data,
                message: ackPayload.message ?? null, error: null,
                requestId, version: stateEntry.version, sequence
            });
            return;
        }

        if (TERMINAL_STATES.has(state)) {
            this._emitToDashboard(entry, { state, message: ackPayload.message, data: ackPayload.data, error: ackPayload.error });
            this._resolve(entry, {
                success: false, state, data: ackPayload.data ?? null,
                message: ackPayload.message ?? null, error: ackPayload.error ?? null,
                requestId, version: null, sequence: null
            });
            return;
        }

        // Non-terminal progress ack (received/processing) — relay it AND
        // slide the inactivity timeout forward. This is what lets
        // long-running multi-step handlers (create role, create channel,
        // edit permissions on every channel, send embed, ...) survive past
        // the default 15s window: as long as the bot keeps proving it's
        // still working (either via its own ctx.progress() calls or the
        // automatic handler heartbeat in configBus.js), the clock keeps
        // resetting. A hard ceiling (MAX_TOTAL_TIMEOUT_MS) still applies
        // regardless, so a truly stuck handler can't hang forever.
        entry.hasProgressed = true;
        const elapsed = Date.now() - entry.createdAt;
        if (elapsed < MAX_TOTAL_TIMEOUT_MS) {
            clearTimeout(entry.timeout);
            const remainingBudget = MAX_TOTAL_TIMEOUT_MS - elapsed;
            const nextWindow = Math.min(entry.timeoutMs, remainingBudget);
            entry.timeout = setTimeout(() => this._handleTimeout(requestId), nextWindow);
            if (entry.timeout.unref) entry.timeout.unref();
        }

        this._emitToDashboard(entry, { state, message: ackPayload.message, data: ackPayload.data, error: ackPayload.error });
    }

    /**
     * Fail every pending request tied to a bot socket that just disconnected
     * so dashboards never see an infinite "waiting for bot" spinner.
     */
    handleBotDisconnect(botSocketId) {
        for (const [, entry] of this.pending) {
            if (entry.botSocketId !== botSocketId) continue;
            this._emitToDashboard(entry, {
                state: 'failed',
                error: 'bot_disconnected',
                message: 'Bot disconnected while processing request'
            });
            this._resolve(entry, {
                success: false, state: 'failed', data: null,
                message: 'Bot disconnected while processing request',
                error: 'bot_disconnected', requestId: entry.requestId, version: null, sequence: null
            });
        }
    }

    getStats() {
        return {
            pending: this.pending.size,
            completedCacheSize: this.completed.size,
            moduleState: moduleState.getStats(),
            metrics: requestLog.getMetrics()
        };
    }

    shutdown() {
        clearInterval(this._sweepTimer);
        for (const [, entry] of this.pending) {
            clearTimeout(entry.timeout);
        }
        this.pending.clear();
        this.completed.clear();
    }

    // ─── Internal ────────────────────────────────────────────────────

    _handleTimeout(requestId) {
        const entry = this.pending.get(requestId);
        if (!entry) return;

        const elapsed = Date.now() - entry.createdAt;
        const hitHardCeiling = elapsed >= MAX_TOTAL_TIMEOUT_MS;

        // Idempotent actions get exactly one automatic retry, but ONLY if
        // the bot never showed any sign of life at all (no 'received' /
        // 'processing' ack ever arrived — e.g. the dispatch was dropped on
        // the wire, or the bot was mid-reconnect). If the bot DID start
        // working (entry.hasProgressed), replaying the dispatch could
        // double-apply side effects (create the role/channel twice), so we
        // must not auto-retry — just report the timeout and let the user
        // decide. This absorbs transient delivery hiccups without ever
        // risking a duplicate mutation.
        if (entry.idempotent && entry.retryCount < 1 && !entry.hasProgressed) {
            this.pending.delete(requestId);
            clearTimeout(entry.timeout);
            requestLog.complete({ requestId, state: 'timeout', error: 'timeout_retrying' });

            this._emitToDashboard(entry, { state: 'sending', message: 'No response yet, retrying once...' });

            this._dispatchOnce(entry.originalOpts, entry.retryCount + 1).then(entry.resolve);
            return;
        }

        const message = hitHardCeiling
            ? 'Bot has been working on this for over 3 minutes without finishing. It may be stuck — please try again.'
            : 'Bot did not respond in time. Please try again.';

        this._emitToDashboard(entry, { state: 'timeout', message, error: 'timeout' });
        this._resolve(entry, {
            success: false, state: 'timeout', data: null,
            message, error: 'timeout', requestId, version: null, sequence: null
        });
    }

    _resolve(entry, result) {
        clearTimeout(entry.timeout);
        this.pending.delete(entry.requestId);
        this.completed.set(entry.requestId, { completedAt: Date.now() });
        this._boundCompletedCache();
        requestLog.complete({ requestId: entry.requestId, state: result.state, error: result.error });
        entry.resolve(result);
    }

    _emitToDashboard(entry, extra) {
        const envelope = {
            requestId: entry.requestId,
            module: entry.module,
            action: entry.action,
            serverId: entry.serverId,
            botId: entry.botId,
            timestamp: Date.now(),
            ...extra
        };
        if (entry.serverId) this.io.to(`server_${entry.serverId}`).emit('config:event', envelope);
        if (entry.userId) this.io.to(`user_${entry.userId}`).emit('config:event', envelope);
    }

    _nextSequence(moduleName, serverId) {
        const key = `${moduleName}:${serverId}`;
        const next = (this.sequences.get(key) || 0) + 1;
        this.sequences.set(key, next);
        return next;
    }

    _boundCompletedCache() {
        if (this.completed.size <= COMPLETED_CACHE_MAX) return;
        const overflow = this.completed.size - COMPLETED_CACHE_MAX;
        let i = 0;
        for (const key of this.completed.keys()) {
            if (i++ >= overflow) break;
            this.completed.delete(key);
        }
    }

    _sweep() {
        const now = Date.now();

        for (const [id, meta] of this.completed) {
            if (now - meta.completedAt > COMPLETED_CACHE_TTL_MS) {
                this.completed.delete(id);
            }
        }

        // Safety net: pending entries should always resolve via their own
        // setTimeout, but guard against orphaned entries just in case.
        for (const [id, entry] of this.pending) {
            if (now - entry.createdAt > COMPLETED_CACHE_TTL_MS * STALE_PENDING_MULTIPLIER) {
                this.logger.warn?.(`[ConfigProtocol] Force-clearing stale pending request ${id}`);
                this._handleTimeout(id);
            }
        }
    }
}

module.exports = { ConfigProtocol };

// middleware/lib/botHealth.js
//
// Tracks liveness/health for every connected bot socket: heartbeat age,
// round-trip latency, and basic runtime stats reported by the bot itself.
// Broadcasts a lightweight snapshot to dashboards so the UI can show
// "Bot Online / Offline / Degraded" without polling.

const STALE_MS = 65000; // no heartbeat in >65s => considered offline
const BROADCAST_INTERVAL_MS = 15000;

class BotHealth {
    constructor({ io } = {}) {
        this.io = io || null;
        /** @type {Map<string, object>} botId -> health record */
        this.bots = new Map();

        this._broadcastTimer = setInterval(() => this._broadcast(), BROADCAST_INTERVAL_MS);
        if (this._broadcastTimer.unref) this._broadcastTimer.unref();
    }

    attach(io) {
        this.io = io;
    }

    register(botId, { userId, socketId } = {}) {
        this.bots.set(botId, {
            botId, userId, socketId,
            connectedAt: Date.now(),
            lastHeartbeat: Date.now(),
            lastLatencyMs: null,
            guildCount: 0,
            memoryMb: null,
            status: 'online'
        });
    }

    heartbeat(botId, { latencyMs, guildCount, memoryMb } = {}) {
        const bot = this.bots.get(botId);
        if (!bot) return;
        bot.lastHeartbeat = Date.now();
        bot.status = 'online';
        if (typeof latencyMs === 'number') bot.lastLatencyMs = latencyMs;
        if (typeof guildCount === 'number') bot.guildCount = guildCount;
        if (typeof memoryMb === 'number') bot.memoryMb = memoryMb;
    }

    markOffline(botId) {
        const bot = this.bots.get(botId);
        if (bot) bot.status = 'offline';
    }

    remove(botId) {
        this.bots.delete(botId);
    }

    getSnapshot(botId) {
        const bot = this.bots.get(botId);
        if (!bot) return null;
        return this._toPublic(bot);
    }

    getAllForUser(userId) {
        const out = [];
        for (const bot of this.bots.values()) {
            if (bot.userId === userId) out.push(this._toPublic(bot));
        }
        return out;
    }

    _toPublic(bot) {
        const ageMs = Date.now() - bot.lastHeartbeat;
        return {
            botId: bot.botId,
            status: ageMs > STALE_MS ? 'offline' : bot.status,
            lastHeartbeatAgoMs: ageMs,
            lastLatencyMs: bot.lastLatencyMs,
            guildCount: bot.guildCount,
            memoryMb: bot.memoryMb,
            connectedAt: bot.connectedAt
        };
    }

    _broadcast() {
        if (!this.io) return;
        for (const bot of this.bots.values()) {
            const snapshot = this._toPublic(bot);
            if (bot.userId) {
                this.io.to(`user_${bot.userId}`).emit('bot:health', snapshot);
            }
        }
    }

    shutdown() {
        clearInterval(this._broadcastTimer);
        this.bots.clear();
    }
}

module.exports = { BotHealth, STALE_MS };

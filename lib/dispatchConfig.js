// middleware/lib/dispatchConfig.js
//
// The single entry point every module route uses to talk to a bot. This
// replaces the legacy forwardCommand()/COMMAND_RESPONSE_MAP pair entirely —
// there is no fire-and-forget path left anywhere in this codebase.
//
// dispatchConfig() resolves a target bot for (userId, serverId), sends the
// action through ConfigProtocol, and writes a standard HTTP response
// carrying the full lifecycle outcome: { success, state, data, message,
// error, requestId, version, sequence }. Socket 'config:event' broadcasts
// carry the same shape for live progress; this is just the terminal result.

let configProtocol = null;
let botRegistry = null;

/**
 * Wire this module up once, during core bootstrap.
 * @param {import('./configProtocol').ConfigProtocol} protocol
 * @param {import('./botRegistry')} registry
 */
function init(protocol, registry) {
    configProtocol = protocol;
    botRegistry = registry;
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object} opts
 * @param {string} opts.serverId
 * @param {string} opts.module
 * @param {string} opts.action
 * @param {object} [opts.payload]
 * @param {boolean} [opts.idempotent]   safe to auto-retry once on timeout
 * @param {number}  [opts.expectedVersion] optimistic-concurrency guard
 * @param {number}  [opts.timeoutMs]
 */
async function dispatchConfig(req, res, opts) {
    if (!configProtocol || !botRegistry) {
        return res.status(500).json({ success: false, state: 'failed', error: 'protocol_not_initialized', message: 'Server misconfiguration' });
    }

    const { serverId, module: moduleName, action, payload = {}, idempotent = false, expectedVersion, timeoutMs, stateKey } = opts;
    const userId = req.user.id;
    const userGuilds = req.session?.userGuilds || [];

    const target = botRegistry.findBotForServer(userId, serverId, userGuilds);
    if (!target) {
        return res.status(404).json({ success: false, state: 'failed', error: 'bot_offline', message: 'Server not found or bot offline' });
    }

    const botSocket = botRegistry.getSocket(target.socketId);
    if (!botSocket) {
        return res.status(404).json({ success: false, state: 'failed', error: 'bot_socket_missing', message: 'Bot socket not found' });
    }

    const result = await configProtocol.dispatch({
        botSocketId: target.socketId,
        botId: target.botId,
        serverId,
        userId: target.userId,
        module: moduleName,
        action,
        payload,
        idempotent,
        expectedVersion,
        timeoutMs,
        stateKey
    });

    const httpStatus = result.success ? 200
        : result.error === 'timeout' ? 504
        : result.error === 'version_conflict' ? 409
        : 400;

    res.status(httpStatus).json(result);
}

/**
 * Read the last known authoritative state for a module+server from cache,
 * requesting a fresh copy from the bot in the background if we have
 * nothing cached yet (or the caller forces a refresh). Always returns fast
 * — cached data first, bot dispatch only feeds future reads/broadcasts.
 */
function readCached(moduleState, moduleName, serverId) {
    const entry = moduleState.get(moduleName, serverId);
    return entry ? { data: entry.data, version: entry.version, updatedAt: entry.updatedAt } : { data: null, version: null, updatedAt: null };
}

module.exports = { init, dispatchConfig, readCached };

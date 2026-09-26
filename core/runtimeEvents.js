// middleware/core/runtimeEvents.js
//
// Generic relay for spontaneous, bot-initiated runtime events that have NO
// originating dashboard request to correlate with — live anti-raid threat
// scores, Discord gateway changes (channel/role created), AFK mentions from
// real chat activity, giveaway participants joining via reaction, periodic
// server-stat channel refreshes, and so on.
//
// This is architecturally different from the config request/response
// protocol (lib/configProtocol.js) on purpose: those are unary
// "dashboard asks, bot answers" calls, this is a fire-and-forget pub/sub
// stream, same distinction gRPC/most RPC frameworks draw between unary and
// streaming calls. Trying to force spontaneous pushes through the
// request/response protocol would mean fabricating a fake "request" for
// every Discord event, which the bot doesn't have.
//
// Wire contract:
//   Bot -> Middleware   'runtime:event'  { type, serverId, userId?, payload, timestamp }
//   Middleware -> Dashboard  re-emits the SAME event name as `type` (so
//     existing dashboard listeners like `server_data_updated` or
//     `threat_scores_updated` keep working without change), scoped to the
//     bot owner's user room and the server's room.
//
// Modules never need to register anything here — any bot module can call
// `runtimeEmit(socket, type, serverId, payload)` (see Bot/dashboard/lib/
// runtimeEvents.js) and it is automatically relayed. This file also updates
// lib/moduleState.js for a curated allow-list of types so that reconnect/
// resync (config:sync_request) can serve reasonably fresh data for those
// modules too, without requiring the bot to explicitly "set" state.

// Runtime event types whose payload should also be mirrored into
// moduleState (keyed by a module name) so `config:sync_request` can hand
// it back during reconnect. Anything not listed here is still relayed
// live but isn't retained for resync — that's fine for high-frequency,
// low-value-at-rest events like heartbeats or search results.
const STATE_MIRROR = {
    guild_data: 'guildMeta',
    server_stats: 'guildMeta',
    threat_scores: 'antiSystem.threatScores',
    violations: 'antiSystem.violations',
};

function initRuntimeEvents({ io, botRegistry, moduleState, debugLogger }) {
    function handle(socket, envelope) {
        const { type, serverId, payload } = envelope || {};
        if (!type) return;

        const botData = botRegistry.getBot(socket.botId);
        const userId = botData?.userId;

        // Bulk state hydration sent once at bot startup (see
        // Bot/dashboard/lib/configBus.js `emitBulkSync` /
        // `legacySyncShim`) — primes moduleState for every guild this bot
        // manages so a dashboard that connects moments later renders from
        // cache instantly instead of waiting on a live round trip per
        // module. Not broadcast further; it's a cache warm-up, not a
        // user-visible event.
        if (type === 'module_state_bulk_sync') {
            const { module: moduleName, entries } = payload || {};
            if (moduleName && Array.isArray(entries)) {
                for (const entry of entries) {
                    if (!entry?.serverId) continue;
                    moduleState.set(moduleName, entry.serverId, entry.data);
                    // guildMeta's bulk sync (bot startup) carries the same
                    // owner/channels/roles snapshot a live 'guild_data'
                    // event would — mirror it into botRegistry too so
                    // isGuildOwner()/isBotManager() permission checks work
                    // immediately after bot connect instead of only after
                    // the FIRST channel/role/guild gateway event for that
                    // guild happens to fire.
                    if (moduleName === 'guildMeta') botRegistry.setGuildData(entry.serverId, entry.data);
                }
                debugLogger.logEvent('runtime', 'module_state_bulk_sync', { module: moduleName, count: entries.length });
            }
            return;
        }

        debugLogger.logEvent('runtime', type, { serverId, botId: socket.botId });

        // Update botRegistry's guild cache when the bot reports fresh guild
        // metadata — several modules' permission checks (isGuildOwner) read
        // from this.
        if (type === 'guild_data' && payload?.serverId) {
            botRegistry.setGuildData(payload.serverId, payload);
        }

        const mirrorKey = STATE_MIRROR[type];
        if (mirrorKey && serverId) {
            moduleState.set(mirrorKey, serverId, payload);
        }

        if (serverId) io.to(`server_${serverId}`).emit(type, payload);
        if (userId) io.to(`user_${userId}`).emit(type, payload);
    }

    return { handle };
}

module.exports = { initRuntimeEvents };

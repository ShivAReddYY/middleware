// middleware/core/sockets.js
//
// Core socket.io connection handling shared by every module:
//   - bot authentication (bot_connect / bot_connected / bot_auth_failed)
//   - dashboard authentication (dashboard_connect / dashboard_connected)
//   - server room management (join_server_room / leave_server_room)
//   - the generic config protocol ack channel (config:ack)
//   - bot heartbeats (bot:heartbeat)
//   - reconnect/resync (config:sync_request / config:sync_response)
//   - disconnect cleanup
//
// Feature-module-specific payloads (welcome config, quarantine users, ...)
// never appear here — those are handled entirely through the generic
// config protocol (lib/configProtocol.js + lib/moduleState.js) or, for
// spontaneous bot-initiated pushes with no originating dashboard request
// (heartbeats, live anti-raid scores, Discord gateway changes), through
// the dedicated runtime broadcast relay in core/runtimeEvents.js.

const mongoose = require('mongoose');

function attachApiKeyModel() {
    const keySchema = new mongoose.Schema(
        {
            keyValue: { type: String, required: true, unique: true, index: true },
            userId: { type: String, required: true, index: true },
            discordId: { type: String, index: true },
            service: { type: String, required: true },
            isActive: { type: Boolean, default: true },
            createdAt: { type: Date, default: Date.now },
            lastUsedAt: { type: Date, default: null },
            description: { type: String, default: '' },
            botId: { type: String, default: null },
            _class: { type: String, default: 'com.ssrr.tech.AuthSystem.model.ApiKey' }
        },
        { collection: 'apikeys' }
    );
    return mongoose.model('ApiKey', keySchema);
}

function initSockets({ io, debugLogger, configProtocol, botRegistry, botHealth, moduleState, runtimeEvents }) {
    const KeyModel = attachApiKeyModel();
    const UserModel = mongoose.connection.collection('users');

    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);
        debugLogger.debugData.connections.socketConnections[socket.id] = {
            connectTime: new Date().toISOString(), type: 'unknown', userId: null, botId: null
        };
        debugLogger.logEvent('socket', 'connection', { socketId: socket.id });

        // ─── Bot authentication ───
        socket.on('bot_connect', async (data) => {
            const { botId, apiKey, userId: discordId } = data || {};
            console.log(`🔐 Bot connect attempt from botId: ${botId}, discordId: ${discordId}, socketId: ${socket.id}`);

            try {
                const userDoc = await UserModel.findOne({ discordId });
                if (!userDoc) {
                    socket.emit('bot_auth_failed', { message: 'User not registered' });
                    return;
                }

                const objectUserId = userDoc._id.toString();
                const keyDoc = await KeyModel.findOne({ userId: objectUserId, keyValue: apiKey, isActive: true });
                if (!keyDoc) {
                    socket.emit('bot_auth_failed', { message: 'Invalid API key' });
                    return;
                }

                keyDoc.isActive = true;
                keyDoc.botId = botId;
                keyDoc.lastUsedAt = new Date();
                await keyDoc.save();

                const botData = {
                    userId: discordId,
                    mongoUserId: objectUserId,
                    socketId: socket.id,
                    serverData: [],
                    lastHeartbeat: Date.now(),
                    authenticated: true,
                    connectTime: Date.now()
                };

                botRegistry.registerBot(botId, botData);
                botHealth.register(botId, { userId: discordId, socketId: socket.id });

                socket.botId = botId;
                socket.userId = objectUserId;
                socket.join(`bot_${botId}`);
                socket.join(`user_${objectUserId}`);

                debugLogger.debugData.connections.socketConnections[socket.id] = {
                    connectTime: new Date().toISOString(), type: 'bot', userId: objectUserId, botId
                };

                socket.emit('bot_connected', { success: true });
                debugLogger.logEvent('socket', 'bot_connected', { botId, userId: objectUserId, socketId: socket.id });
                debugLogger.updateActiveBots(botRegistry.activeBots);
                debugLogger.updateStatistics(botRegistry.activeBots, botRegistry.userSessions);

                console.log(`🎉 Bot ${botId} connected successfully for user ${objectUserId}`);
            } catch (error) {
                console.error('❌ Bot connection error:', error);
                socket.emit('bot_auth_failed', { message: 'Connection failed' });
                debugLogger.logError(error, 'bot_connect');
            }
        });

        // ─── Dashboard authentication ───
        socket.on('dashboard_connect', (data) => {
            const { userId } = data || {};
            if (!userId) return;

            botRegistry.registerUserSession(userId, { socketId: socket.id, isAuthenticated: true, connectTime: Date.now() });
            socket.userId = userId;
            socket.join(`user_${userId}`);

            debugLogger.debugData.connections.socketConnections[socket.id] = {
                connectTime: new Date().toISOString(), type: 'dashboard', userId, botId: null
            };
            debugLogger.logEvent('socket', 'dashboard_connect', { userId, socketId: socket.id });

            socket.emit('dashboard_connected', { success: true });

            // Push current server lists for this user's bot(s) immediately —
            // this is a snapshot, not a "config" the generic protocol tracks.
            setTimeout(() => {
                for (const [botId, bot] of botRegistry.activeBots.entries()) {
                    if (bot.userId === userId && bot.serverData?.length) {
                        socket.emit('server_data_updated', { botId, servers: bot.serverData });
                    }
                }
                debugLogger.updateUserSessions(botRegistry.userSessions);
                debugLogger.updateStatistics(botRegistry.activeBots, botRegistry.userSessions);
            }, 100);
        });

        // ─── Server room management (per-guild live broadcast scoping) ───
        socket.on('join_server_room', (data) => {
            const { serverId } = data || {};
            if (serverId && socket.userId) socket.join(`server_${serverId}`);
        });

        socket.on('leave_server_room', (data) => {
            const { serverId } = data || {};
            if (serverId) socket.leave(`server_${serverId}`);
        });

        // ─── Generic config protocol ack channel ───
        // Every module's bot-side handler acks through this single event.
        socket.on('config:ack', (ackPayload) => {
            configProtocol.handleAck(ackPayload);
        });

        // ─── Bot guild-list snapshot ───
        // The bot pushes its full guild list on connect, reconnect, and on
        // guildCreate/guildDelete via a direct socket.emit('bot_data_update',
        // { type: 'servers', payload: guilds }) — see
        // Bot/dashboard/initializer.js `sendInitialData()`/`relayGuildsSnapshot()`.
        // This is NOT routed through the generic config protocol (there's no
        // originating dashboard request) and NOT a per-server runtime event
        // (it's bot-wide, not scoped to one guild) — it's the one piece of
        // bot->middleware wiring that stays a dedicated listener. Without
        // this, `bot.serverData` never populates and every
        // findBotForServer()/getAnyBotWithServer() lookup silently fails,
        // which is why the dashboard would otherwise show "bot not online"
        // even though the bot is connected and heartbeating fine.
        socket.on('bot_data_update', (data) => {
            const { type, payload } = data || {};
            if (type !== 'servers' || !socket.botId) return;

            const bot = botRegistry.getBot(socket.botId);
            if (!bot) return;

            bot.serverData = Array.isArray(payload) ? payload : [];
            debugLogger.logEvent('socket', 'servers_updated', { botId: socket.botId, serverCount: bot.serverData.length });
            debugLogger.updateActiveBots(botRegistry.activeBots);

            console.log(`📡 Bot ${socket.botId} reported ${bot.serverData.length} server(s)`);

            // Mirror the legacy broadcast shape so the dashboard's existing
            // 'server_data_updated' listener (DashboardContext.tsx) keeps
            // working unchanged.
            if (bot.userId) {
                io.to(`user_${bot.userId}`).emit('server_data_updated', { botId: socket.botId, servers: bot.serverData });
            }
        });

        // ─── Reconnect / resync ───
        // Dashboard (on load or reconnect) or bot (on reconnect) can ask for
        // everything currently known about a server in one shot instead of
        // re-requesting every module individually.
        socket.on('config:sync_request', ({ serverId } = {}) => {
            if (!serverId) return;
            socket.emit('config:sync_response', {
                serverId,
                modules: moduleState.getAllForServer(serverId),
                timestamp: Date.now()
            });
        });

        // ─── Bot heartbeat ───
        socket.on('bot:heartbeat', (data = {}) => {
            if (!socket.botId) return;
            const bot = botRegistry.getBot(socket.botId);
            if (bot) bot.lastHeartbeat = Date.now();
            botHealth.heartbeat(socket.botId, data);
            debugLogger.updateHeartbeat(socket.botId, Date.now());
        });

        // ─── Spontaneous bot-initiated runtime events (no dashboard request) ───
        // Live threat scores, gateway changes, AFK mentions, giveaway expiry,
        // etc. See core/runtimeEvents.js for the full list — this is a
        // deliberately separate channel from the request/response config
        // protocol because there is no originating request to correlate.
        socket.on('runtime:event', (envelope) => {
            runtimeEvents.handle(socket, envelope);
        });

        // ─── Disconnect cleanup ───
        socket.on('disconnect', () => {
            debugLogger.logEvent('socket', 'disconnect', { socketId: socket.id, botId: socket.botId, userId: socket.userId });

            if (socket.botId) {
                botRegistry.removeBot(socket.botId);
                botHealth.markOffline(socket.botId);
                debugLogger.updateActiveBots(botRegistry.activeBots);
                configProtocol.handleBotDisconnect(socket.id);
            }

            if (socket.userId) {
                botRegistry.removeUserSession(socket.userId);
                debugLogger.updateUserSessions(botRegistry.userSessions);
            }

            delete debugLogger.debugData.connections.socketConnections[socket.id];
            debugLogger.updateStatistics(botRegistry.activeBots, botRegistry.userSessions);
        });
    });

    // Stale bot sweep (heartbeat watchdog) — safety net beyond botHealth's
    // own staleness reporting, actually evicts long-dead bots from the
    // registry so findBotForServer() never routes to a ghost socket.
    setInterval(() => {
        const now = Date.now();
        const staleThreshold = 2 * 60 * 1000;
        let removed = 0;
        for (const [botId, bot] of botRegistry.activeBots) {
            if (now - bot.lastHeartbeat > staleThreshold) {
                botRegistry.removeBot(botId);
                botHealth.remove(botId);
                removed++;
            }
        }
        if (removed > 0) {
            debugLogger.updateActiveBots(botRegistry.activeBots);
            debugLogger.updateStatistics(botRegistry.activeBots, botRegistry.userSessions);
            console.log(`🧹 Cleaned up ${removed} stale bots`);
        }
    }, 60000);
}

module.exports = { initSockets };

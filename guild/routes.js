// middleware/guild/routes.js
//
// Cross-cutting guild/permission routes — NOT a feature module. These
// endpoints answer "which servers can this user see", "what channels/roles
// does this guild have", and admin cache inspection. Every feature module's
// routes.js depends on `ensureServerAccess`/`findBotForServer` from here
// (via botRegistry) but this file has no feature-specific knowledge.

const moduleState = require('../lib/moduleState');

const GUILD_META_MODULE = 'guildMeta';

// One-shot, race-safe request/response correlator for the bot's
// 'get_server_details' -> 'server_details_response' pair. Unlike a bare
// `socket.once('server_details_response', ...)`, this only ever resolves
// (and only ever removes) its OWN listener — a concurrent request for a
// different serverId can no longer "steal" this listener's single fire and
// leave it hanging until its timeout, which was a latent bug in the
// previous /details implementation.
function requestServerDetails(botSocket, serverId, timeoutMs = 8000) {
    return new Promise((resolve) => {
        let settled = false;
        const onResponse = (data) => {
            if (settled || data?.serverId !== serverId) return;
            settled = true;
            clearTimeout(timer);
            botSocket.off('server_details_response', onResponse);
            resolve(data);
        };
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            botSocket.off('server_details_response', onResponse);
            resolve(null);
        }, timeoutMs);
        botSocket.on('server_details_response', onResponse);
        botSocket.emit('get_server_details', { serverId });
    });
}

function registerGuildRoutes(app, { ensureAuthenticated, debugLogger, botRegistry, io }) {
    // Shared read path for every channels/roles/dropdown/guild-data
    // endpoint below: serve the cache if it's warm, otherwise request a
    // fresh snapshot from the bot and WAIT for it (bounded timeout) so the
    // very first request for a server actually gets real data instead of
    // a 404/null that nothing ever retries. A cache entry missing its
    // `channels` array counts as cold too — that shape only happens if
    // something else ever wrote a non-guildMeta payload into this bucket.
    async function getOrFetchGuildMeta(req, serverId) {
        const cached = moduleState.get(GUILD_META_MODULE, serverId);
        if (cached?.data?.channels) return cached.data;

        const targetBot = botRegistry.findBotForServer(req.user.id, serverId, req.session?.userGuilds || []);
        if (!targetBot) return cached?.data || null;
        const botSocket = botRegistry.getSocket(targetBot.socketId);
        if (!botSocket) return cached?.data || null;

        const fresh = await requestServerDetails(botSocket, serverId);
        if (fresh) {
            const entry = moduleState.set(GUILD_META_MODULE, serverId, fresh);
            botRegistry.setGuildData(serverId, fresh);
            return entry.data;
        }
        return cached?.data || null;
    }

    // ─── Server-specific access control middleware (used by feature modules too) ───
    async function ensureServerAccess(req, res, next) {
        const serverId = req.params.serverId;
        const userId = req.user?.id;
        if (!userId || !serverId) return res.status(401).json({ message: 'Unauthorized' });

        const userGuilds = req.session?.userGuilds || [];
        if (!botRegistry.isInRequiredGuild(userGuilds)) {
            return res.status(403).json({ success: false, error: 'required_guild', message: 'You must join the required Discord server to use this dashboard' });
        }

        const botOwnerAccess = botRegistry.findBotForServer(userId, serverId, userGuilds);
        if (botOwnerAccess) {
            req.accessRole = botOwnerAccess.userId === userId ? 'bot_owner' : (botRegistry.hasServerAccess(userId, serverId).role);
            return next();
        }

        return res.status(403).json({ success: false, error: 'no_access', message: 'You do not have access to this server' });
    }

    app.get('/api/user/guilds', ensureAuthenticated, (req, res) => {
        res.json({ success: true, guilds: req.session?.userGuilds || [] });
    });

    // Main endpoint the dashboard uses to populate the server switcher.
    app.get('/api/user/accessible-servers', ensureAuthenticated, async (req, res) => {
        const userId = req.user.id;
        const userGuilds = req.session?.userGuilds || [];

        const allBotServers = [];
        for (const [botId, bot] of botRegistry.activeBots) {
            if (bot.serverData) allBotServers.push(...bot.serverData.map((s) => ({ ...s, botId, botUserId: bot.userId })));
        }

        if (allBotServers.length === 0) {
            return res.json({ success: false, error: 'no_bot', message: 'No bots are currently online.' });
        }

        const userBotServers = allBotServers.filter((s) => s.botUserId === userId);
        if (userBotServers.length > 0) {
            return res.json({ success: true, servers: userBotServers.map((s) => ({ ...s, accessRole: 'bot_owner' })), role: 'bot_owner' });
        }

        const accessibleServers = [];
        for (const server of allBotServers) {
            const guildData = botRegistry.getGuildData(server.id);
            if (guildData && guildData.owner === userId) {
                accessibleServers.push({ ...server, accessRole: 'server_owner' });
                continue;
            }
            if (botRegistry.isBotManager(userId, server.id)) {
                accessibleServers.push({ ...server, accessRole: 'bot_manager' });
            }
        }

        if (accessibleServers.length === 0) {
            const botGuildIds = new Set(allBotServers.map((s) => s.id));
            const userInBotGuild = userGuilds.some((g) => botGuildIds.has(g.id));
            return res.json(userInBotGuild
                ? { success: false, error: 'no_access', message: "You don't have access to any servers yet. Ask the server owner to grant dashboard access." }
                : { success: false, error: 'no_bot', message: "The bot isn't installed in any of your servers." });
        }

        res.json({ success: true, servers: accessibleServers });
    });

    app.get('/api/user/active-bots', ensureAuthenticated, (req, res) => {
        try {
            const userId = req.user.id;
            const userBots = Array.from(botRegistry.activeBots.entries())
                .filter(([, bot]) => bot.userId === userId)
                .map(([botId, bot]) => ({
                    botId, serverData: bot.serverData, lastHeartbeat: bot.lastHeartbeat,
                    online: Date.now() - bot.lastHeartbeat < 60000
                }));
            res.json(userBots);
        } catch (error) {
            res.status(500).json({ message: 'Internal server error' });
        }
    });

    // Full server details (channels/roles/etc) — requested live from the
    // bot over a one-shot socket round trip since this isn't a "config"
    // tracked by moduleState, just a snapshot render. Also warms the
    // moduleState cache so subsequent /channels /roles /dropdown-data
    // calls for this server are instant.
    app.get('/api/server/:serverId/details', ensureAuthenticated, async (req, res) => {
        const { serverId } = req.params;
        const userId = req.user.id;
        const userGuilds = req.session?.userGuilds || [];

        const targetBot = botRegistry.findBotForServer(userId, serverId, userGuilds);
        if (!targetBot) return res.status(404).json({ message: 'Server not found or bot offline' });

        const botSocket = botRegistry.getSocket(targetBot.socketId);
        if (!botSocket) return res.status(503).json({ message: 'Bot not available' });

        const data = await requestServerDetails(botSocket, serverId, 10000);
        if (!data) return res.status(408).json({ message: 'Request timeout' });

        moduleState.set(GUILD_META_MODULE, serverId, data);
        botRegistry.setGuildData(serverId, data);
        res.json(data);
    });

    // Every channels/roles/dropdown-data/guild-data read shares the same
    // self-healing cache-or-fetch-and-wait path, so the FIRST request for
    // a server (cold cache) gets real data instead of a 404/null that
    // nothing ever retries — this was the root cause of dropdowns
    // (ChannelSelect/RoleSelect) rendering empty on first open.
    app.get('/api/server/:serverId/guild-data', ensureAuthenticated, async (req, res) => {
        const { serverId } = req.params;
        const data = await getOrFetchGuildMeta(req, serverId);
        const cached = moduleState.get(GUILD_META_MODULE, serverId);
        res.json({ success: true, data, version: cached?.version ?? null, updatedAt: cached?.updatedAt ?? null });
    });

    app.get('/api/server/:serverId/channels', ensureAuthenticated, async (req, res) => {
        const data = await getOrFetchGuildMeta(req, req.params.serverId);
        if (!data) return res.status(404).json({ success: false, error: 'Guild data not found' });
        res.json({ success: true, channels: data.channels, categories: data.categories });
    });

    app.get('/api/server/:serverId/roles', ensureAuthenticated, async (req, res) => {
        const data = await getOrFetchGuildMeta(req, req.params.serverId);
        if (!data) return res.status(404).json({ success: false, error: 'Guild data not found' });
        res.json({ success: true, roles: data.roles });
    });

    app.get('/api/server/:serverId/dropdown-data', ensureAuthenticated, async (req, res) => {
        const guildData = await getOrFetchGuildMeta(req, req.params.serverId);
        if (!guildData) return res.status(404).json({ success: false, error: 'Guild data not found' });

        res.json({
            success: true,
            data: {
                channels: (guildData.channels || []).map((c) => ({ id: c.id, name: c.name, type: c.type, typeString: c.typeString, parentName: c.parentName })),
                categories: (guildData.categories || []).map((c) => ({ id: c.id, name: c.name })),
                roles: (guildData.roles || []).filter((r) => !r.managed && !r.isEveryone).map((r) => ({ id: r.id, name: r.name, color: r.color, hexColor: r.hexColor }))
            }
        });
    });

    app.get('/api/server/:serverId/stats', ensureAuthenticated, async (req, res) => {
        const { serverId } = req.params;
        const guildData = await getOrFetchGuildMeta(req, serverId);
        if (!guildData) {
            return res.status(404).json({ success: false, error: 'Guild data not found' });
        }

        const channels = Array.isArray(guildData.channels) ? guildData.channels : [];
        const textChannels = channels.filter(c => c.type === 0).length;
        const voiceChannels = channels.filter(c => c.type === 2).length;
        const categories = Array.isArray(guildData.categories) ? guildData.categories.length : 0;
        const roleCount = Array.isArray(guildData.roles) ? guildData.roles.length : 0;

        res.json({
            success: true,
            data: {
                serverId,
                name: guildData.name || '',
                memberCount: guildData.memberCount || 0,
                channelCount: channels.length,
                textChannels,
                voiceChannels,
                categories,
                roleCount,
                boostLevel: guildData.boostLevel || 0,
                boostCount: guildData.boostCount || 0,
                createdAt: guildData.createdAt || new Date().toISOString(),
                features: Array.isArray(guildData.features) ? guildData.features : [],
                lastUpdated: new Date()
            }
        });
    });

    app.post('/api/server/:serverId/refresh-data', ensureAuthenticated, (req, res) => {
        const { serverId } = req.params;
        moduleState.delete(GUILD_META_MODULE, serverId);

        const targetBot = botRegistry.findBotForServer(req.user.id, serverId, req.session?.userGuilds || []);
        if (!targetBot) return res.status(503).json({ success: false, error: 'No active bot found for this server' });

        botRegistry.getSocket(targetBot.socketId)?.emit('get_server_details', { serverId });
        res.json({ success: true, message: 'Refreshing server data from bot' });
    });

    // Member search (used by MemberSelect UI component) — one-shot socket
    // round trip via the generic config protocol so it gets the same
    // timeout/observability behavior as everything else.
    //
    // IMPORTANT: this dispatches under module name 'guildMeta' (that's
    // where the bot's searchMembers handler is registered — see
    // registerConfigHandlers.js) but writes its result into a SEPARATE
    // moduleState bucket via `stateKey: 'guildMembers'`. Without that
    // override, every member search would overwrite the SAME 'guildMeta'
    // cache bucket the channels/roles dropdowns read from — replacing the
    // full guild snapshot with just `{serverId, members}` and silently
    // emptying every ChannelSelect/RoleSelect on that server the next time
    // anyone opened a member picker. That was the actual root cause of
    // "channels/roles dropdowns randomly go empty across modules."
    app.get('/api/server/:serverId/members', ensureAuthenticated, async (req, res) => {
        const { serverId } = req.params;
        const { query } = req.query;
        const { dispatchConfig } = require('../lib/dispatchConfig');
        await dispatchConfig(req, res, {
            serverId, module: 'guildMeta', action: 'searchMembers',
            payload: { query: query || '' }, idempotent: true,
            stateKey: 'guildMembers'
        });
    });

    // ─── Admin cache inspection ───
    app.get('/api/admin/cache/guild-stats', ensureAuthenticated, (req, res) => {
        if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Admin access required' });
        res.json({ success: true, stats: { moduleState: moduleState.getStats(), memory: process.memoryUsage() } });
    });

    app.delete('/api/admin/cache/guild/:serverId', ensureAuthenticated, (req, res) => {
        if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Admin access required' });
        moduleState.clearServer(req.params.serverId);
        res.json({ success: true, message: `Cache cleared for server ${req.params.serverId}` });
    });

    return { ensureServerAccess };
}

module.exports = { registerGuildRoutes, GUILD_META_MODULE };

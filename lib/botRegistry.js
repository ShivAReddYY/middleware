// middleware/lib/botRegistry.js
//
// Central registry of connected bot sockets, dashboard user sessions, and
// the permission model used to decide whether a given Discord user may act
// on a given guild. Extracted from the old monolithic index.js so every
// module route file can share one source of truth instead of closing over
// module-level variables scattered through an 8000-line file.
//
// This module owns NO business logic about any feature — it only answers
// "which bot socket serves this guild, and is this user allowed to touch
// it?". Feature-specific state lives in lib/moduleState.js.

const moduleState = require('./moduleState');

class BotRegistry {
    constructor({ io, requiredGuildId = null } = {}) {
        this.io = io;
        this.requiredGuildId = requiredGuildId;

        /** @type {Map<string, object>} botId -> { userId, socketId, serverData, lastHeartbeat, authenticated, connectTime } */
        this.activeBots = new Map();

        /** @type {Map<string, object>} userId -> { socketId, isAuthenticated, connectTime } */
        this.userSessions = new Map();

        /** @type {Map<string, object>} serverId -> cached guild data (owner, channels, roles, ...) */
        this.guildData = new Map();
    }

    // ─── Bot lifecycle ───────────────────────────────────────────────

    registerBot(botId, botData) {
        this.activeBots.set(botId, botData);
    }

    removeBot(botId) {
        this.activeBots.delete(botId);
    }

    getBot(botId) {
        return this.activeBots.get(botId);
    }

    getSocket(socketId) {
        return this.io.sockets.sockets.get(socketId);
    }

    registerUserSession(userId, sessionData) {
        this.userSessions.set(userId, sessionData);
    }

    removeUserSession(userId) {
        this.userSessions.delete(userId);
    }

    setGuildData(serverId, data) {
        this.guildData.set(String(serverId), data);
    }

    getGuildData(serverId) {
        return this.guildData.get(String(serverId));
    }

    // ─── Bot lookup ──────────────────────────────────────────────────

    /** Any bot that currently reports having this server — no permission check. */
    getAnyBotWithServer(serverId) {
        for (const bot of this.activeBots.values()) {
            if (bot.serverData?.some((s) => s.id === serverId)) return bot;
        }
        return null;
    }

    /**
     * Find a bot serving `serverId` that `userId` is allowed to operate on.
     * Priority: bot owned by this user > any bot with the server if the
     * user is guild owner or bot manager.
     */
    findBotForServer(userId, serverId, userGuilds = []) {
        for (const bot of this.activeBots.values()) {
            if (bot.userId === userId && bot.serverData?.some((s) => s.id === serverId)) {
                return this._withResolvedBotId(bot);
            }
        }

        const anyBot = this.getAnyBotWithServer(serverId);
        if (!anyBot) return null;

        if (this.isGuildOwner(userId, serverId) || this.isBotManager(userId, serverId)) {
            return this._withResolvedBotId(anyBot);
        }
        return null;
    }

    _withResolvedBotId(bot) {
        if (bot.botId) return bot;
        for (const [id, candidate] of this.activeBots) {
            if (candidate === bot) return { ...bot, botId: id };
        }
        return bot;
    }

    // ─── Permissions ─────────────────────────────────────────────────

    isGuildOwner(userId, serverId) {
        const guildData = this.getGuildData(serverId);
        return !!(guildData && guildData.owner === userId);
    }

    isBotManager(userId, serverId) {
        const config = moduleState.get('serverConfig', serverId)?.data;
        return config?.botManagers?.includes(userId) || false;
    }

    hasServerAccess(userId, serverId) {
        if (this.isGuildOwner(userId, serverId)) return { allowed: true, role: 'server_owner' };
        if (this.isBotManager(userId, serverId)) return { allowed: true, role: 'bot_manager' };
        return { allowed: false, role: null };
    }

    isInRequiredGuild(userGuilds = []) {
        if (!this.requiredGuildId) return true;
        return userGuilds.some((g) => g.id === this.requiredGuildId);
    }

    getStats() {
        return {
            activeBots: this.activeBots.size,
            userSessions: this.userSessions.size,
            cachedGuilds: this.guildData.size
        };
    }
}

module.exports = { BotRegistry };

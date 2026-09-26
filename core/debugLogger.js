// middleware/core/debugLogger.js
//
// Lightweight JSON debug/event logger, extracted verbatim from the old
// monolithic index.js. Writes a rolling snapshot to debug_data.json every
// 5s for local inspection. Not a replacement for lib/requestLog.js (which
// tracks the new config protocol specifically) — this is general server
// activity (auth events, API requests, errors, heartbeats).

const path = require('path');
const fs = require('fs');

class DebugLogger {
    constructor({ port, frontendUrl }) {
        this.debugData = {
            metadata: {
                serverStartTime: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                version: '2.0.0'
            },
            server: {
                port,
                frontendUrl,
                nodeEnv: process.env.NODE_ENV || 'development',
                isProduction: process.env.NODE_ENV === 'production'
            },
            connections: {
                activeBots: {},
                userSessions: {},
                socketConnections: {}
            },
            database: {
                mongodb: {
                    connected: false,
                    connectionString: process.env.API_KEYS_MONGODB_URI ? '[REDACTED]' : 'not_set',
                    lastError: null
                }
            },
            discord: {
                clientId: process.env.DISCORD_CLIENT_ID || 'not_set',
                callbackUrl: process.env.DISCORD_CALLBACK_URL || `http://localhost:${port}/auth/discord/callback`,
                authSessions: []
            },
            realTimeEvents: [],
            apiRequests: [],
            errors: [],
            heartbeats: {},
            statistics: {
                totalConnections: 0,
                totalBotConnections: 0,
                totalUserConnections: 0,
                totalApiRequests: 0,
                totalErrors: 0
            }
        };

        this._saveTimer = setInterval(() => this.saveDebugData(), 5000);
        if (this._saveTimer.unref) this._saveTimer.unref();
    }

    updateMetadata() {
        this.debugData.metadata.lastUpdated = new Date().toISOString();
    }

    logEvent(category, event, data = {}) {
        const eventLog = { timestamp: new Date().toISOString(), category, event, data: JSON.parse(JSON.stringify(data)) };
        this.debugData.realTimeEvents.unshift(eventLog);
        if (this.debugData.realTimeEvents.length > 100) this.debugData.realTimeEvents.length = 100;
        this.updateMetadata();
    }

    logApiRequest(method, url, params = {}, response = {}) {
        const requestLog = {
            timestamp: new Date().toISOString(), method, url, params,
            response: { status: response.status || 200, message: response.message || 'success' }
        };
        this.debugData.apiRequests.unshift(requestLog);
        this.debugData.statistics.totalApiRequests++;
        if (this.debugData.apiRequests.length > 50) this.debugData.apiRequests.length = 50;
        this.updateMetadata();
    }

    logError(error, context = '') {
        const errorLog = { timestamp: new Date().toISOString(), context, message: error.message, stack: error.stack, type: error.name || 'Error' };
        this.debugData.errors.unshift(errorLog);
        this.debugData.statistics.totalErrors++;
        if (this.debugData.errors.length > 50) this.debugData.errors.length = 50;
        this.updateMetadata();
    }

    updateActiveBots(activeBots) {
        this.debugData.connections.activeBots = {};
        for (const [botId, bot] of activeBots) {
            this.debugData.connections.activeBots[botId] = {
                userId: bot.userId, socketId: bot.socketId,
                serverCount: bot.serverData?.length || 0, servers: bot.serverData || [],
                lastHeartbeat: new Date(bot.lastHeartbeat).toISOString(),
                authenticated: bot.authenticated,
                isOnline: Date.now() - bot.lastHeartbeat < 60000,
                connectionDuration: Date.now() - (bot.connectTime || Date.now())
            };
        }
        this.updateMetadata();
    }

    updateUserSessions(userSessions) {
        this.debugData.connections.userSessions = {};
        for (const [userId, sess] of userSessions) {
            this.debugData.connections.userSessions[userId] = {
                socketId: sess.socketId, isAuthenticated: sess.isAuthenticated,
                connectTime: sess.connectTime ? new Date(sess.connectTime).toISOString() : null
            };
        }
        this.updateMetadata();
    }

    updateHeartbeat(botId, timestamp) {
        this.debugData.heartbeats[botId] = { lastHeartbeat: new Date(timestamp).toISOString(), isAlive: Date.now() - timestamp < 60000 };
        this.updateMetadata();
    }

    updateStatistics(activeBots, userSessions) {
        this.debugData.statistics.totalConnections = activeBots.size + userSessions.size;
        this.debugData.statistics.totalBotConnections = activeBots.size;
        this.debugData.statistics.totalUserConnections = userSessions.size;
        this.updateMetadata();
    }

    saveDebugData() {
        try {
            fs.writeFileSync(path.join(__dirname, '..', 'debug_data.json'), JSON.stringify(this.debugData, null, 2));
        } catch (error) {
            console.error('Failed to save debug data:', error);
        }
    }

    getDebugData() {
        return JSON.parse(JSON.stringify(this.debugData));
    }
}

module.exports = { DebugLogger };

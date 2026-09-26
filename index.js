// middleware/index.js
//
// Thin bootstrap entry point. All business logic now lives in dedicated
// folders:
//   core/     — express/http/socket.io/session/mongoose bootstrap, socket
//               connection handling, spontaneous runtime event relay
//   auth/     — Discord OAuth2 + session identity routes
//   guild/    — cross-cutting guild/permission routes (not a feature module)
//   modules/  — one folder per feature (welcome, quarantine, tickets, ...),
//               each with its own routes.js, auto-discovered and mounted
//   lib/      — shared infrastructure: the config request/response
//               protocol (configProtocol.js), the bot/session registry
//               (botRegistry.js), the authoritative state cache
//               (moduleState.js), bot health tracking (botHealth.js),
//               request/latency metrics (requestLog.js), and the DRY route
//               helper every module uses (createModuleRoutes.js)
//
// The previous version of this file was ~8200 lines: a monolith mixing
// bootstrap, auth, ~50 hand-rolled per-module Map caches, a fire-and-forget
// forwardCommand()/COMMAND_RESPONSE_MAP dispatcher, and every single
// module's REST routes in one place. None of that remains — every module
// now goes through the generic, production-grade config lifecycle protocol
// (see lib/configProtocol.js), with full request/response acknowledgment,
// timeout handling, automatic retry for idempotent operations, optimistic
// concurrency, and live progress events to the dashboard.

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

const { createBootstrap } = require('./core/bootstrap');
const { initSockets } = require('./core/sockets');
const { initRuntimeEvents } = require('./core/runtimeEvents');
const { initDiscordAuth } = require('./auth/discordStrategy');
const { registerAuthRoutes } = require('./auth/routes');
const { registerGuildRoutes } = require('./guild/routes');
const { createAuthMiddleware } = require('./lib/authMiddleware');
const { init: initDispatchConfig } = require('./lib/dispatchConfig');
const { mountModules } = require('./lib/mountModules');
const moduleState = require('./lib/moduleState');
const requestLog = require('./lib/requestLog');

const {
    app, server, io, PORT, FRONTEND_URL, REQUIRED_GUILD_ID,
    debugLogger, configProtocol, botRegistry, botHealth, isOriginAllowed
} = createBootstrap();

// ─── Wire shared infrastructure together ───
initDispatchConfig(configProtocol, botRegistry);
const { CLIENT_ID, CALLBACK_URL } = initDiscordAuth({ debugLogger });
const { ensureAuthenticated } = createAuthMiddleware({ debugLogger });
const runtimeEvents = initRuntimeEvents({ io, botRegistry, moduleState, debugLogger });
initSockets({ io, debugLogger, configProtocol, botRegistry, botHealth, moduleState, runtimeEvents });

// ─── Routes ───
registerAuthRoutes(app, { debugLogger, FRONTEND_URL, REQUIRED_GUILD_ID, CLIENT_ID, CALLBACK_URL, isOriginAllowed });
const { ensureServerAccess } = registerGuildRoutes(app, { ensureAuthenticated, debugLogger, botRegistry, io });

const mountedModules = mountModules(app, { ensureAuthenticated, ensureServerAccess, debugLogger, botRegistry, io });
console.log(`📦 Mounted ${mountedModules.length} feature modules: ${mountedModules.join(', ')}`);

// ─── Observability ───
app.get('/api/debug', (req, res) => res.json(debugLogger.getDebugData()));
app.get('/debug', (req, res) => {
    const debugPath = path.join(__dirname, 'debug_data.json');
    if (fs.existsSync(debugPath)) {
        return res.sendFile(debugPath);
    }
    res.json(debugLogger.getDebugData());
});

app.get('/api/admin/protocol-stats', ensureAuthenticated, (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Admin access required' });
    res.json({
        success: true,
        protocol: configProtocol.getStats(),
        requestLog: requestLog.getRecent(100),
        bots: botRegistry.getStats()
    });
});

app.get('/api/server-status', (req, res) => {
    const status = {
        serverOnline: true,
        activeBots: botRegistry.activeBots.size,
        activeUsers: botRegistry.userSessions.size,
        uptime: process.uptime(),
        memory: process.memoryUsage()
    };
    debugLogger.logApiRequest('GET', '/api/server-status', {}, { status: 200, ...status });
    res.json(status);
});

app.get('/', (req, res) => {
    res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Discord Bot Manager - Online</title><meta charset="UTF-8"></head>
        <body>
            <h1>Discord Bot Manager</h1>
            <p>Server Status: <strong style="color: green;">ONLINE</strong></p>
            <p>Uptime: ${process.uptime()} seconds</p>
            <p>Last Check: ${new Date().toISOString()}</p>
            <script>setTimeout(() => location.reload(), 300000);</script>
        </body>
        </html>
    `);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Socket.IO enabled at ws://localhost:${PORT}`);
    debugLogger.logEvent('system', 'server_started', { port: PORT, env: process.env.NODE_ENV || 'development' });
});

module.exports = { app, server, io };

// middleware/modules/gateVerification/routes.js
const MODULE = 'gateVerification';
const STATS_MODULE = 'gateVerificationStats';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    // Stats are registered on the bot under 'gateVerificationStats', not
    // 'gateVerification' — needs its own instance so the dispatch module
    // actually matches (a `stateKey` override alone only renames the cache
    // bucket, it doesn't change the dispatched module name).
    const stats = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, STATS_MODULE);

    routes.read('/api/server/:serverId/verification', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/verification/enable', 'enable', { payload: (req) => ({ configData: req.body }) });
    routes.post('/api/server/:serverId/verification/disable', 'disable');
    routes.put('/api/server/:serverId/verification', 'update', { payload: (req) => ({ updateData: req.body }) });
    routes.delete('/api/server/:serverId/verification', 'delete');

    stats.read('/api/server/:serverId/verification/stats', { warmOnMiss: 'getStats', responseKey: 'stats' });
    routes.post('/api/server/:serverId/verification/message', 'sendMessage', { idempotent: false });
}

module.exports = { register, MODULE };

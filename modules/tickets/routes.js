// middleware/modules/tickets/routes.js
const MODULE = 'tickets';
const STATS_MODULE = 'ticketsStats';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    // Stats are registered on the bot under 'ticketsStats', not 'tickets' —
    // needs its own instance so the dispatch module actually matches (a
    // `stateKey` override alone only renames the cache bucket, it doesn't
    // change the dispatched module name).
    const stats = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, STATS_MODULE);

    routes.read('/api/server/:serverId/tickets', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/tickets', 'setup');
    routes.put('/api/server/:serverId/tickets', 'update');
    routes.patch('/api/server/:serverId/tickets/status', (req) => (req.body.status ? 'enable' : 'disable'));
    routes.delete('/api/server/:serverId/tickets', 'delete');

    stats.read('/api/server/:serverId/tickets/stats', { warmOnMiss: 'getStats', responseKey: 'stats' });
}

module.exports = { register, MODULE };

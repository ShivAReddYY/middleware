// middleware/modules/reactionroles/routes.js
const MODULE = 'reactionroles';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    const listRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, 'reactionrolesList');
    const statsRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, 'reactionrolesStats');

    // Paginated by query params — always a live dispatch, same pattern as
    // afk's list route and birthday's upcoming route.
    listRoutes.mutate('get', '/api/server/:serverId/reaction-roles', 'get', {
        idempotent: true,
        payload: (req) => ({ options: { page: parseInt(req.query.page) || 1, limit: parseInt(req.query.limit) || 10 } })
    });

    routes.mutate('get', '/api/server/:serverId/reaction-role/:setupId', 'get', {
        idempotent: true,
        payload: (req) => ({ setupId: req.params.setupId })
    });

    routes.post('/api/server/:serverId/reaction-roles', 'create', {
        payload: (req) => ({ options: { ...req.body, createdBy: req.user.id } })
    });

    routes.put('/api/server/:serverId/reaction-role/:setupId', 'update', {
        payload: (req) => ({ setupId: req.params.setupId, updates: req.body })
    });

    routes.delete('/api/server/:serverId/reaction-role/:setupId', 'delete', {
        payload: (req) => ({ setupId: req.params.setupId })
    });

    statsRoutes.read('/api/server/:serverId/reaction-roles/stats', { warmOnMiss: 'get', responseKey: 'stats' });
}

module.exports = { register, MODULE };

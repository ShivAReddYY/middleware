// middleware/modules/giveaway/routes.js
const MODULE = 'giveaway';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    const listRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, 'giveawayList');
    const statsRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, 'giveawayStats');

    // Paginated/filtered by query params — always a live dispatch.
    listRoutes.mutate('get', '/api/server/:serverId/giveaways', 'get', {
        idempotent: true,
        payload: (req) => ({ options: { page: parseInt(req.query.page) || 1, limit: parseInt(req.query.limit) || 10, status: req.query.status || null } })
    });

    routes.mutate('get', '/api/server/:serverId/giveaway/:messageId', 'get', {
        idempotent: true,
        payload: (req) => ({ messageId: req.params.messageId })
    });

    routes.post('/api/server/:serverId/giveaways', 'create', {
        payload: (req) => ({ options: { ...req.body, hostId: req.user.id } })
    });

    routes.put('/api/server/:serverId/giveaway/:messageId', 'update', {
        payload: (req) => ({ messageId: req.params.messageId, updates: req.body })
    });

    routes.delete('/api/server/:serverId/giveaway/:messageId', 'delete', {
        payload: (req) => ({ messageId: req.params.messageId })
    });

    routes.post('/api/server/:serverId/giveaway/:messageId/end', 'end', {
        payload: (req) => ({ messageId: req.params.messageId })
    });

    routes.post('/api/server/:serverId/giveaway/:messageId/reroll', 'reroll', {
        payload: (req) => ({ messageId: req.params.messageId, count: req.body.count })
    });

    routes.post('/api/server/:serverId/giveaway/:messageId/participant', 'addParticipant', {
        payload: (req) => ({ messageId: req.params.messageId, userId: req.body.userId, username: req.body.username })
    });

    routes.delete('/api/server/:serverId/giveaway/:messageId/participant/:userId', 'removeParticipant', {
        payload: (req) => ({ messageId: req.params.messageId, userId: req.params.userId })
    });

    routes.delete('/api/server/:serverId/giveaway/:messageId/participants', 'clearParticipants', {
        payload: (req) => ({ messageId: req.params.messageId })
    });

    routes.patch('/api/server/:serverId/giveaway/:messageId/status', 'toggleStatus', {
        payload: (req) => ({ messageId: req.params.messageId, status: req.body.status })
    });

    statsRoutes.read('/api/server/:serverId/giveaways/stats', { warmOnMiss: 'get', responseKey: 'stats' });
}

module.exports = { register, MODULE };

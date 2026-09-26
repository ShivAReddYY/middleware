// middleware/modules/notifications/routes.js
const MODULE = 'notifications';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    routes.read('/api/server/:serverId/notifications', { warmOnMiss: 'get', responseKey: 'configs', transform: (d) => d || [] });

    routes.post('/api/server/:serverId/notifications', 'setup');
    routes.put('/api/server/:serverId/notifications/:notificationId', 'update', {
        payload: (req) => ({ notificationId: req.params.notificationId, updates: req.body })
    });
    routes.delete('/api/server/:serverId/notifications/:notificationId', 'delete', {
        payload: (req) => ({ notificationId: req.params.notificationId })
    });
    routes.delete('/api/server/:serverId/notifications', 'deleteAll');
}

module.exports = { register, MODULE };

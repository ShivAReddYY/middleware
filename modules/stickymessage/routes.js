// middleware/modules/stickymessage/routes.js
const MODULE = 'stickymessage';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    routes.read('/api/server/:serverId/stickymessage', { warmOnMiss: 'get', responseKey: 'configs', transform: (d) => d || [] });

    routes.post('/api/server/:serverId/stickymessage', 'create');
    routes.put('/api/server/:serverId/stickymessage/:stickyId', 'update', {
        payload: (req) => ({ stickyId: req.params.stickyId, updates: req.body })
    });
    routes.patch('/api/server/:serverId/stickymessage/:stickyId/toggle', 'toggle', {
        payload: (req) => ({ stickyId: req.params.stickyId })
    });
    routes.delete('/api/server/:serverId/stickymessage/:stickyId', 'delete', {
        payload: (req) => ({ stickyId: req.params.stickyId })
    });
    routes.delete('/api/server/:serverId/stickymessage', 'deleteAll');
}

module.exports = { register, MODULE };

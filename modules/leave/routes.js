// middleware/modules/leave/routes.js
const MODULE = 'leave';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    routes.read('/api/server/:serverId/leave', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/leave', 'setup');
    routes.put('/api/server/:serverId/leave', 'update');

    routes.patch('/api/server/:serverId/leave/channel', 'toggleChannel');
    routes.patch('/api/server/:serverId/leave/dm', 'toggleDm');

    routes.delete('/api/server/:serverId/leave', 'delete');
}

module.exports = { register, MODULE };

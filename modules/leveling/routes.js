// middleware/modules/leveling/routes.js
const MODULE = 'leveling';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    routes.read('/api/server/:serverId/leveling', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/leveling', 'setup');
    routes.put('/api/server/:serverId/leveling', 'update');
    routes.patch('/api/server/:serverId/leveling/toggle', 'toggle');
    routes.delete('/api/server/:serverId/leveling', 'delete');
}

module.exports = { register, MODULE };

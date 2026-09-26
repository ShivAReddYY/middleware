// middleware/modules/nqn/routes.js
const MODULE = 'nqn';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    routes.read('/api/server/:serverId/nqn', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/nqn', 'setup');
    routes.put('/api/server/:serverId/nqn', 'update');
    routes.patch('/api/server/:serverId/nqn/toggle', 'toggle');
    routes.delete('/api/server/:serverId/nqn', 'delete');
}

module.exports = { register, MODULE };

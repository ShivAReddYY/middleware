// middleware/modules/boost/routes.js
const MODULE = 'boost';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    routes.read('/api/server/:serverId/boost', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/boost', 'setup');
    routes.put('/api/server/:serverId/boost', 'update');
    routes.delete('/api/server/:serverId/boost', 'delete');
}

module.exports = { register, MODULE };

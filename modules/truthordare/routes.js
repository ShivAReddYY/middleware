// middleware/modules/truthordare/routes.js
const MODULE = 'truthordare';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    routes.read('/api/server/:serverId/truthordare', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/truthordare', 'setup');
    routes.put('/api/server/:serverId/truthordare', 'update');
    routes.delete('/api/server/:serverId/truthordare', 'delete');
}

module.exports = { register, MODULE };

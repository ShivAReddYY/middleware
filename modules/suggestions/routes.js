// middleware/modules/suggestions/routes.js
const MODULE = 'suggestions';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    routes.read('/api/server/:serverId/suggestions', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/suggestions', 'setup');
    routes.put('/api/server/:serverId/suggestions', 'update');
    routes.delete('/api/server/:serverId/suggestions', 'delete');
}

module.exports = { register, MODULE };

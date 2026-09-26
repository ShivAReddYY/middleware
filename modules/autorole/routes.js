// middleware/modules/autorole/routes.js
const MODULE = 'autorole';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    routes.read('/api/server/:serverId/autorole', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/autorole', 'setup');
    routes.put('/api/server/:serverId/autorole', 'update');
    routes.patch('/api/server/:serverId/autorole/toggle', 'toggle');
    routes.delete('/api/server/:serverId/autorole', 'delete');
}

module.exports = { register, MODULE };

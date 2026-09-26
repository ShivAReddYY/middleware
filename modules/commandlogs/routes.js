// middleware/modules/commandlogs/routes.js
const MODULE = 'commandlogs';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    routes.read('/api/server/:serverId/commandlogs', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/commandlogs', 'setup');
    routes.put('/api/server/:serverId/commandlogs', 'update');
    routes.patch('/api/server/:serverId/commandlogs/toggle', 'toggle');
    routes.delete('/api/server/:serverId/commandlogs', 'delete');
}

module.exports = { register, MODULE };

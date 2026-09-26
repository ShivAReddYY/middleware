// middleware/modules/modmail/routes.js
const MODULE = 'modmail';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    routes.read('/api/server/:serverId/modmail', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/modmail', 'setup');
    routes.put('/api/server/:serverId/modmail', 'update');
    routes.patch('/api/server/:serverId/modmail/toggle', 'toggle');
    routes.delete('/api/server/:serverId/modmail', 'delete');
}

module.exports = { register, MODULE };

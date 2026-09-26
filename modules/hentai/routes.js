// middleware/modules/hentai/routes.js
const MODULE = 'hentai';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    routes.read('/api/server/:serverId/hentai', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/hentai', 'setup');
    routes.put('/api/server/:serverId/hentai', 'update');
    routes.patch('/api/server/:serverId/hentai/toggle', 'toggle');
    routes.delete('/api/server/:serverId/hentai', 'delete');
}

module.exports = { register, MODULE };

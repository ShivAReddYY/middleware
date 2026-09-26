// middleware/modules/serverstats/routes.js
const MODULE = 'serverstats';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    routes.read('/api/server/:serverId/serverstats', { warmOnMiss: 'get', responseKey: 'serverStats' });

    routes.post('/api/server/:serverId/serverstats/setup', 'setup', {
        payload: (req) => ({ options: req.body })
    });
    routes.delete('/api/server/:serverId/serverstats/channel/:type', 'removeChannel', {
        payload: (req) => ({ type: req.params.type })
    });
    routes.delete('/api/server/:serverId/serverstats', 'clear');
    routes.post('/api/server/:serverId/serverstats/update', 'forceUpdate');
    routes.put('/api/server/:serverId/serverstats/settings', 'updateSettings', {
        payload: (req) => ({ settings: req.body })
    });
}

module.exports = { register, MODULE };

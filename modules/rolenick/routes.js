// middleware/modules/rolenick/routes.js
const MODULE = 'rolenick';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    const statsRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, 'rolenickStats');

    routes.read('/api/server/:serverId/rolenick', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/rolenick', 'add');
    routes.put('/api/server/:serverId/rolenick/:roleId', 'updateFormat', {
        payload: (req) => ({ roleId: req.params.roleId, newFormat: req.body.nicknameFormat })
    });
    routes.delete('/api/server/:serverId/rolenick/:roleId', 'remove', {
        payload: (req) => ({ roleId: req.params.roleId })
    });
    routes.post('/api/server/:serverId/rolenick/clear', 'clear');
    routes.delete('/api/server/:serverId/rolenick', 'delete');
    routes.post('/api/server/:serverId/rolenick/apply/:memberId', 'applyToMember', {
        payload: (req) => ({ memberId: req.params.memberId })
    });

    statsRoutes.read('/api/server/:serverId/rolenick/stats', { warmOnMiss: 'get', responseKey: 'stats' });
}

module.exports = { register, MODULE };

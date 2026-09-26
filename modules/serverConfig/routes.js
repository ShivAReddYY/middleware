// middleware/modules/serverConfig/routes.js
const MODULE = 'serverConfig';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    const statsRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, 'serverConfigStats');

    routes.read('/api/server/:serverId/serverconfig', { warmOnMiss: 'get' });

    routes.put('/api/server/:serverId/serverconfig', 'update', {
        payload: (req) => ({ configData: req.body })
    });

    routes.post('/api/server/:serverId/serverconfig/managers', 'addManagers', {
        payload: (req) => {
            if (!Array.isArray(req.body.managerIds)) throw Object.assign(new Error('managerIds must be an array'), { httpStatus: 400 });
            return { managerIds: req.body.managerIds };
        }
    });

    routes.delete('/api/server/:serverId/serverconfig/managers', 'removeManagers', {
        payload: (req) => {
            if (!Array.isArray(req.body.managerIds)) throw Object.assign(new Error('managerIds must be an array'), { httpStatus: 400 });
            return { managerIds: req.body.managerIds };
        }
    });

    routes.patch('/api/server/:serverId/serverconfig/prefix', 'updatePrefix', {
        payload: (req) => ({ prefix: req.body.prefix })
    });

    routes.post('/api/server/:serverId/serverconfig/reset', 'reset');
    routes.delete('/api/server/:serverId/serverconfig', 'delete');

    statsRoutes.read('/api/server/:serverId/serverconfig/stats', { warmOnMiss: 'get', responseKey: 'stats' });

    // Bot-manager permission check is a live, parameterized lookup (keyed by
    // :userId) — not safe to serve from the per-server config cache.
    app.get('/api/server/:serverId/serverconfig/check/:userId', ensureAuthenticated, async (req, res) => {
        const { dispatchConfig } = require('../../lib/dispatchConfig');
        await dispatchConfig(req, res, {
            serverId: req.params.serverId, module: MODULE, action: 'checkBotManager',
            idempotent: true, payload: { userId: req.params.userId }
        });
    });
}

module.exports = { register, MODULE };

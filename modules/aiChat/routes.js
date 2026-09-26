// middleware/modules/aiChat/routes.js
const MODULE = 'aiChat';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    // Stats are a distinctly-shaped read with its own module string on the
    // bot side (`aiChatStats`) — separate instance so it never shares a
    // moduleState/cache bucket with the main config.
    const statsRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, 'aiChatStats');

    routes.read('/api/server/:serverId/aichat', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/aichat', 'setup', {
        payload: (req) => ({ ...req.body, userId: req.user.id })
    });
    routes.put('/api/server/:serverId/aichat', 'update', {
        payload: (req) => ({ updateData: req.body, userId: req.user.id })
    });
    routes.patch('/api/server/:serverId/aichat/status', (req) => (req.body.status ? 'enable' : 'disable'), {
        payload: (req) => ({ userId: req.user.id })
    });
    routes.patch('/api/server/:serverId/aichat/toggle', 'toggle', {
        payload: (req) => ({ userId: req.user.id })
    });
    routes.delete('/api/server/:serverId/aichat', 'delete');

    statsRoutes.read('/api/server/:serverId/aichat/stats', { warmOnMiss: 'get', responseKey: 'stats' });

    // NOTE: the old file also exposed GET /aichat/check/:channelId
    // (command 'check_aichat_active') and two global, non-server-scoped
    // routes (GET /api/aichat/enabled, POST /api/aichat/bulk/enable). None
    // of those have a corresponding action in the fixed aiChat action list
    // (get/setup/update/enable/disable/delete/toggle) registered in
    // Bot/dashboard/lib/registerConfigHandlers.js, so they are intentionally
    // left out here rather than inventing a new action name — see summary.
}

module.exports = { register, MODULE };

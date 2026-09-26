// middleware/modules/welcome/routes.js
//
// Welcome message system. Golden-template module: every route goes through
// the generic config protocol (dispatchConfig via createModuleRoutes) —
// there is no bespoke Map, no forwardCommand, no legacy fire-and-forget
// path. Bot-side handlers are registered in
// Bot/dashboard/lib/registerConfigHandlers.js against the SAME action
// names used here, delegating to the untouched business logic in
// Bot/dashboard/modules/welcome/welcome.js.

const MODULE = 'welcome';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    routes.read('/api/server/:serverId/welcome', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/welcome', 'setup');
    routes.put('/api/server/:serverId/welcome', 'update');
    routes.patch('/api/server/:serverId/welcome/channel', 'toggleChannel', { payload: (req) => ({ status: req.body.status }) });
    routes.patch('/api/server/:serverId/welcome/dm', 'toggleDm', { payload: (req) => ({ status: req.body.status }) });
    routes.patch('/api/server/:serverId/welcome/status', (req) => (req.body.status ? 'enable' : 'disable'), {});
    routes.delete('/api/server/:serverId/welcome', 'delete');
}

module.exports = { register, MODULE };

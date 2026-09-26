// middleware/modules/autovoice/routes.js
const MODULE = 'autovoice';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    // Temporary channels and stats are distinctly-shaped reads with their
    // own module strings on the bot side (`autovoiceTemp`, `autovoiceStats`)
    // — separate instances so their cache buckets never collide with the
    // main autovoice config.
    const tempRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, 'autovoiceTemp');
    const statsRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, 'autovoiceStats');

    routes.read('/api/server/:serverId/autovoice', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/autovoice', 'create');
    routes.put('/api/server/:serverId/autovoice', 'update', {
        payload: (req) => ({ updateData: req.body })
    });
    routes.patch('/api/server/:serverId/autovoice/status', (req) => (req.body.status ? 'activate' : 'deactivate'));
    routes.delete('/api/server/:serverId/autovoice', 'delete');

    tempRoutes.read('/api/server/:serverId/autovoice/temp', { warmOnMiss: 'get', responseKey: 'channels', transform: (d) => d || [] });
    tempRoutes.delete('/api/server/:serverId/autovoice/temp/:channelId', 'forceDelete', {
        payload: (req) => ({ channelId: req.params.channelId })
    });

    routes.post('/api/server/:serverId/autovoice/refresh', 'refreshPanel');
    routes.post('/api/server/:serverId/autovoice/cleanup', 'cleanup');

    statsRoutes.read('/api/server/:serverId/autovoice/stats', { warmOnMiss: 'get', responseKey: 'stats' });
}

module.exports = { register, MODULE };

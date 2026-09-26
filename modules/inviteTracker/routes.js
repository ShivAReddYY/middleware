// middleware/modules/inviteTracker/routes.js
const MODULE = 'inviteTracker';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    // Stats are a distinctly-shaped read with their own module string on the
    // bot side (`inviteTrackerStats`) — separate instance so its cache bucket
    // never collides with the main inviteTracker config, same reasoning as
    // quarantine's stats/users split.
    const statsRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, 'inviteTrackerStats');

    routes.read('/api/server/:serverId/invitetracker', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/invitetracker', 'setup', {
        payload: (req) => {
            if (!req.body.channelId) throw Object.assign(new Error('channelId is required'), { httpStatus: 400 });
            return { channelId: req.body.channelId, status: req.body.status !== undefined ? req.body.status : true };
        }
    });

    routes.put('/api/server/:serverId/invitetracker', 'update', {
        payload: (req) => ({ updateData: req.body })
    });

    // Mirrors the old branch: an explicit status in the body goes through the
    // regular update path (so it lands in the same updateData shape as PUT),
    // otherwise it falls back to a plain toggle.
    routes.patch('/api/server/:serverId/invitetracker/status', (req) => (req.body.status !== undefined ? 'update' : 'toggle'), {
        payload: (req) => (req.body.status !== undefined ? { updateData: { status: req.body.status } } : {})
    });

    routes.post('/api/server/:serverId/invitetracker/enable', 'enable');
    routes.post('/api/server/:serverId/invitetracker/disable', 'disable');
    routes.delete('/api/server/:serverId/invitetracker', 'delete');

    routes.patch('/api/server/:serverId/invitetracker/channel', 'updateLogChannel', {
        payload: (req) => {
            if (!req.body.channelId) throw Object.assign(new Error('channelId is required'), { httpStatus: 400 });
            return { channelId: req.body.channelId };
        }
    });

    statsRoutes.read('/api/server/:serverId/invitetracker/stats', { warmOnMiss: 'get', responseKey: 'stats' });
}

module.exports = { register, MODULE };

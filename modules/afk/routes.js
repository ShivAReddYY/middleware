// middleware/modules/afk/routes.js
const MODULE = 'afk';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    // List and stats are distinctly-shaped reads with their own module
    // strings on the bot side (`afkList`, `afkStats`) — separate instances
    // so their cache buckets never collide with per-user AFK state.
    const listRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, 'afkList');
    const statsRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, 'afkStats');

    // Per-user AFK status is keyed by :userId, so it isn't safe to serve
    // from the per-server moduleState cache (it would clobber between
    // users checking their own status) — dispatch straight to the bot for
    // a fresh answer every time, same as birthday's `upcoming` route.
    routes.mutate('get', '/api/server/:serverId/afk/user/:userId', 'get', {
        idempotent: true,
        payload: (req) => ({ userId: req.params.userId })
    });

    // Users can only set their own AFK status.
    routes.post('/api/server/:serverId/afk/user/:userId', 'set', {
        payload: (req) => {
            if (req.params.userId !== req.user.id) {
                throw Object.assign(new Error('Can only set your own AFK status'), { httpStatus: 403 });
            }
            return { userId: req.params.userId, ...req.body };
        }
    });

    // Users can only remove their own AFK status.
    routes.delete('/api/server/:serverId/afk/user/:userId', 'remove', {
        payload: (req) => {
            if (req.params.userId !== req.user.id) {
                throw Object.assign(new Error('Insufficient permissions'), { httpStatus: 403 });
            }
            return { userId: req.params.userId };
        }
    });

    // Admin list view. page/limit/status come from query params, so — like
    // birthday's `upcoming` route — this always dispatches live instead of
    // reading from a per-server cache (the old Map-based cache here also
    // held the full unfiltered list and paginated on every request).
    listRoutes.mutate('get', '/api/server/:serverId/afk/list', 'get', {
        idempotent: true,
        payload: (req) => ({
            options: {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 10,
                status: req.query.status || 'active'
            }
        })
    });

    statsRoutes.read('/api/server/:serverId/afk/stats', { warmOnMiss: 'get', responseKey: 'stats' });

    // Users can only update their own auto-response settings.
    routes.put('/api/server/:serverId/afk/user/:userId/auto-response', 'updateAutoResponse', {
        payload: (req) => {
            if (req.params.userId !== req.user.id) {
                throw Object.assign(new Error('Can only update your own auto-response'), { httpStatus: 403 });
            }
            return { userId: req.params.userId, settings: req.body };
        }
    });
}

module.exports = { register, MODULE };

// middleware/modules/embeds/routes.js
//
// Two distinct sub-resources share this file: `embeds` (saved embed
// templates) and `embedSchedules` (recurring send schedules). Both are
// registered on the bot's ConfigBus under separate module names (see
// Bot/dashboard/lib/registerConfigHandlers.js), so we build two
// independent createModuleRoutes() instances here.
//
// The main embeds list (GET /api/server/:serverId/embeds) is hand-rolled
// instead of going through routes.read(): the old handler returned
// filtered/paginated results as top-level `embeds` + `pagination` fields
// (not wrapped in a single `data`/`config` blob), and the bot-side
// `embeds:get` handler already does the pagination/filtering itself from
// `options` (page/limit/category/search) rather than the middleware
// slicing a cached full list. Reusing the generic `read()` helper here
// would either break that response shape or silently drop the query
// params, so this route talks to moduleState/dispatchConfig directly —
// exactly the escape valve createModuleRoutes.js documents for irregular
// endpoints. It also uses its own `embedsList` cache bucket (instead of
// the default `embeds` bucket) so a `create`/`update`/`clone` ack — which
// caches a single embed, not a list — never clobbers the list cache.

const { dispatchConfig } = require('../../lib/dispatchConfig');
const moduleState = require('../../lib/moduleState');

const MODULE = 'embeds';
const SCHEDULES_MODULE = 'embedSchedules';
const LIST_STATE_KEY = 'embedsList';

// dispatchConfig always calls res.status().json() — hand it a no-op
// stand-in for background cache warm-ups where we don't want to touch the
// real (already-responded) `res`.
function noopRes() {
    const noop = () => noop;
    return { status: noop, json: noop };
}

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    const scheduleRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, SCHEDULES_MODULE);

    // ── Embeds list (custom: query params + flat embeds/pagination shape) ──
    app.get('/api/server/:serverId/embeds', ensureAuthenticated, (req, res) => {
        const { serverId } = req.params;
        const { page = 1, limit = 20, category, search } = req.query;

        const cached = moduleState.get(LIST_STATE_KEY, serverId);
        const cachedData = cached?.data;

        if (!cachedData?.embeds?.length) {
            dispatchConfig(req, noopRes(), {
                serverId, module: MODULE, action: 'get', idempotent: true, stateKey: LIST_STATE_KEY,
                payload: { options: { page: parseInt(page), limit: parseInt(limit), category, search } }
            }).catch(() => {});
        }

        res.json({
            success: true,
            embeds: cachedData?.embeds || [],
            pagination: cachedData?.pagination || { current: parseInt(page), total: 0, totalItems: 0 }
        });
    });

    routes.post('/api/server/:serverId/embeds', 'create', {
        payload: (req) => ({ userId: req.user.id, embedData: req.body })
    });
    routes.put('/api/server/:serverId/embeds/:embedId', 'update', {
        payload: (req) => ({ embedId: req.params.embedId, userId: req.user.id, embedData: req.body })
    });
    routes.delete('/api/server/:serverId/embeds/:embedId', 'delete', {
        payload: (req) => ({ embedId: req.params.embedId })
    });
    routes.post('/api/server/:serverId/embeds/:embedId/clone', 'clone', {
        payload: (req) => ({ embedId: req.params.embedId, userId: req.user.id, newName: req.body.newName })
    });
    routes.post('/api/server/:serverId/embeds/:embedId/send', 'send', {
        payload: (req) => ({ embedId: req.params.embedId, channelId: req.body.channelId, options: req.body.options || {} })
    });

    // ── Embed schedules ──
    scheduleRoutes.read('/api/server/:serverId/embeds/schedules/list', {
        warmOnMiss: 'get',
        responseKey: 'schedules',
        transform: (d) => d?.schedules || (Array.isArray(d) ? d : [])
    });
    scheduleRoutes.post('/api/server/:serverId/embeds/schedules', 'create', {
        payload: (req) => ({ userId: req.user.id, scheduleData: req.body })
    });
    scheduleRoutes.patch('/api/server/:serverId/embeds/schedules/:scheduleId/toggle', 'toggle', {
        payload: (req) => ({ scheduleId: req.params.scheduleId })
    });
    scheduleRoutes.delete('/api/server/:serverId/embeds/schedules/:scheduleId', 'delete', {
        payload: (req) => ({ scheduleId: req.params.scheduleId })
    });
}

module.exports = { register, MODULE };

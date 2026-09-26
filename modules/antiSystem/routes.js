// middleware/modules/antiSystem/routes.js
//
// The old index.js only ever exposed a subset of the antiSystem action
// list over REST — the dashboard reached the rest (threat scores,
// violations, system mode, reset) exclusively through the now-removed
// legacy 'config_command' socket event (see
// web/.../components/modules/AntiSystem/useAntiSystem.ts). Since that
// socket event no longer exists anywhere in the stack, those routes are
// added here for real so the dashboard isn't left broken.
const MODULE = 'antiSystem';
const THREAT_SCORES_MODULE = 'antiSystemThreatScores';
const VIOLATIONS_MODULE = 'antiSystemViolations';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    const threatScores = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, THREAT_SCORES_MODULE);
    const violations = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, VIOLATIONS_MODULE);

    routes.read('/api/server/:serverId/anti-system', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/anti-system/reset', 'reset');

    routes.post('/api/server/:serverId/anti-system/system-mode', 'setSystemMode', {
        payload: (req) => ({ mode: req.body.mode, reason: req.body.reason })
    });

    // Paginated/filtered by query — always a live dispatch, not cached.
    threatScores.mutate('get', '/api/server/:serverId/anti-system/threat-scores', 'get', {
        idempotent: true,
        payload: (req) => ({ options: { limit: parseInt(req.query.limit) || 50, minScore: parseInt(req.query.minScore) || 0 } })
    });
    routes.mutate('get', '/api/server/:serverId/anti-system/threat-scores/:userId', 'getUserThreatScore', {
        idempotent: true,
        payload: (req) => ({ userId: req.params.userId })
    });
    routes.post('/api/server/:serverId/anti-system/threat-scores/:userId/reset', 'resetUserThreatScore', {
        payload: (req) => ({ userId: req.params.userId })
    });

    violations.mutate('get', '/api/server/:serverId/anti-system/violations', 'get', {
        idempotent: true,
        payload: (req) => ({ options: { limit: parseInt(req.query.limit) || 100 } })
    });
    violations.read('/api/server/:serverId/anti-system/violations/stats', { warmOnMiss: 'getStats', stateKey: `${VIOLATIONS_MODULE}Stats`, responseKey: 'stats' });
    violations.post('/api/server/:serverId/anti-system/violations/clear', 'clear', {
        payload: (req) => ({ options: req.body || {} })
    });

    routes.put('/api/server/:serverId/anti-system/spam', 'updateSpam', {
        payload: (req) => ({ settings: req.body })
    });
    routes.put('/api/server/:serverId/anti-system/link', 'updateLink', {
        payload: (req) => ({ settings: req.body })
    });
    routes.put('/api/server/:serverId/anti-system/raid', 'updateRaid', {
        payload: (req) => ({ settings: req.body })
    });
    routes.put('/api/server/:serverId/anti-system/nuke', 'updateNuke', {
        payload: (req) => ({ settings: req.body })
    });

    // Toggle module (spam/link/raid/nuke) — old route validated :module
    // against a fixed list and forwarded to `toggle_anti_${module}`; the
    // new fixed action names split that into four distinct actions, so the
    // route resolves which one to dispatch based on the :module param.
    const toggleActionByModule = { spam: 'toggleSpam', link: 'toggleLink', raid: 'toggleRaid', nuke: 'toggleNuke' };
    routes.patch('/api/server/:serverId/anti-system/:module/toggle', (req) => {
        const action = toggleActionByModule[req.params.module];
        if (!action) throw Object.assign(new Error('Invalid module'), { httpStatus: 400 });
        return action;
    }, {
        payload: (req) => req.body
    });

    // The old route forwarded the raw body to a single generic
    // 'update_anti_whitelist' command (no add/remove distinction at the
    // REST layer — that split only existed on the socket path via
    // useAntiSystem.ts's `add_to_whitelist`/`remove_from_whitelist`
    // emits). The fixed action list has no generic "update" for whitelist,
    // only addWhitelist/removeWhitelist, so this route now expects the
    // same `{ type, id }` body plus an `action: 'add' | 'remove'` field to
    // pick between them (defaulting to 'add' when omitted, since 'add' was
    // the more common case). This is an ambiguous-mapping judgment call —
    // see summary.
    routes.put('/api/server/:serverId/anti-system/whitelist', (req) => (req.body.action === 'remove' ? 'removeWhitelist' : 'addWhitelist'), {
        payload: (req) => ({ type: req.body.type, id: req.body.id })
    });

    routes.put('/api/server/:serverId/anti-system/logging', 'updateLogging', {
        payload: (req) => ({ settings: req.body })
    });
}

module.exports = { register, MODULE };

// middleware/modules/gemini/routes.js
//
// Gemini is architecturally unlike every other module in this codebase:
// its routes are NOT nested under /api/server/:serverId/... — they live at
// flat /api/gemini/... paths with `serverId` passed as a query string
// param (GET/DELETE) or a body field (POST/PUT), a holdover from when API
// keys were global and only later became server-scoped. The frontend
// (GeminiList.tsx / GeminiForm.tsx) already depends on this exact shape,
// so it's preserved as-is rather than "fixed" to match the rest of the
// platform's :serverId path convention.
//
// Because `serverId` isn't a route param here, the generic
// createModuleRoutes() helper (which always reads `req.params.serverId`)
// doesn't fit — this file talks to dispatchConfig directly, exactly like
// the escape valve createModuleRoutes.js documents for irregular routes.
//
// Two module names are used on the ConfigBus (see
// Bot/dashboard/lib/registerConfigHandlers.js): `gemini` for key CRUD/test
// actions, and `geminiStats` for the standalone stats action.

const { dispatchConfig } = require('../../lib/dispatchConfig');

const MODULE = 'gemini';
const STATS_MODULE = 'geminiStats';

// Captures what dispatchConfig *would* have written to a real Express
// `res`, so routes that need the OLD bespoke response shape (top-level
// `apiKeys`/`pagination`/`stats`, instead of the generic
// {success,state,data,...} envelope) can reshape it before it reaches the
// browser — without needing dispatchConfig/configProtocol to know about
// any of that.
function captureRes() {
    const captured = { statusCode: 200, body: null };
    const fakeRes = {
        status(code) { captured.statusCode = code; return this; },
        json(body) { captured.body = body; return this; }
    };
    return { fakeRes, captured };
}

function register(app, { ensureAuthenticated }) {
    // Local mutate helper mirroring lib/createModuleRoutes.js's `mutate()`,
    // but pulling `serverId` from wherever the caller supplies it instead
    // of assuming a `:serverId` route param.
    function mutate(method, path, { module = MODULE, action, getServerId, buildPayload, idempotent = false }) {
        app[method](path, ensureAuthenticated, async (req, res) => {
            const serverId = getServerId(req);
            if (!serverId) {
                return res.status(400).json({ success: false, message: 'serverId is required' });
            }
            let payload;
            try {
                payload = buildPayload ? buildPayload(req) : (req.body || {});
            } catch (validationError) {
                return res.status(validationError.httpStatus || 400).json({ success: false, message: validationError.message });
            }
            await dispatchConfig(req, res, { serverId, module, action, payload, idempotent });
        });
    }

    const serverIdFromQuery = (req) => req.query.serverId;
    const serverIdFromBody = (req) => req.body.serverId;

    // ── GET /api/gemini/keys — paginated list (server-scoped via query) ──
    app.get('/api/gemini/keys', ensureAuthenticated, async (req, res) => {
        const { page = 1, limit = 10, serverId } = req.query;
        if (!serverId) return res.status(400).json({ success: false, message: 'serverId is required' });

        const { fakeRes, captured } = captureRes();
        await dispatchConfig(req, fakeRes, {
            serverId, module: MODULE, action: 'getAllKeys', idempotent: true,
            payload: { options: { page: parseInt(page), limit: parseInt(limit) } }
        });

        const result = captured.body || {};
        if (!result.success) {
            return res.status(captured.statusCode).json({ success: false, message: result.message || result.error || 'Failed to fetch API keys' });
        }
        const inner = result.data || {};
        res.json({
            success: true,
            apiKeys: inner.apiKeys || [],
            pagination: inner.pagination || { current: parseInt(page), total: 0, totalItems: 0 },
            serverId
        });
    });

    // ── GET /api/gemini/keys/:keyId — single key (server-scoped via query) ──
    app.get('/api/gemini/keys/:keyId', ensureAuthenticated, async (req, res) => {
        const { keyId } = req.params;
        const { serverId } = req.query;
        if (!serverId) return res.status(400).json({ success: false, message: 'serverId is required' });

        const { fakeRes, captured } = captureRes();
        await dispatchConfig(req, fakeRes, {
            serverId, module: MODULE, action: 'getKey', idempotent: true,
            payload: { keyId }
        });

        const result = captured.body || {};
        // Old contract was lenient here — a missing key was never a hard
        // error, just `apiKey: null` with a 200. getGeminiApiKey() throws
        // when not found, so a 'failed' ack is translated back into that
        // same lenient shape instead of surfacing as an error.
        const inner = result.success ? (result.data || {}) : {};
        res.json({ success: true, apiKey: inner.apiKey || null, serverId });
    });

    // ── GET /api/gemini/stats — server-scoped via query ──
    app.get('/api/gemini/stats', ensureAuthenticated, async (req, res) => {
        const { serverId } = req.query;
        if (!serverId) return res.status(400).json({ success: false, message: 'serverId is required' });

        const { fakeRes, captured } = captureRes();
        await dispatchConfig(req, fakeRes, { serverId, module: STATS_MODULE, action: 'get', idempotent: true });

        const result = captured.body || {};
        if (!result.success) {
            return res.status(captured.statusCode).json({ success: false, message: result.message || result.error || 'Failed to fetch stats' });
        }
        res.json({ success: true, stats: result.data || null, serverId });
    });

    // ── POST /api/gemini/keys — add key (serverId in body) ──
    mutate('post', '/api/gemini/keys', {
        action: 'addKey',
        getServerId: serverIdFromBody,
        buildPayload: (req) => ({ ...req.body, addedBy: req.user.id })
    });

    // ── PUT /api/gemini/keys/:keyId — update key (serverId in body) ──
    mutate('put', '/api/gemini/keys/:keyId', {
        action: 'updateKey',
        getServerId: serverIdFromBody,
        buildPayload: (req) => ({ keyId: req.params.keyId, updates: req.body })
    });

    // ── DELETE /api/gemini/keys/:keyId — remove key (serverId in query) ──
    mutate('delete', '/api/gemini/keys/:keyId', {
        action: 'removeKey',
        getServerId: serverIdFromQuery,
        buildPayload: (req) => ({ keyId: req.params.keyId })
    });

    // ── POST /api/gemini/keys/test — test one or more keys (serverId in body) ──
    mutate('post', '/api/gemini/keys/test', {
        action: 'testKeys',
        getServerId: serverIdFromBody,
        buildPayload: (req) => ({ keyIds: req.body.keyIds })
    });

    // ── POST /api/gemini/keys/:keyId/enable|disable|unblock — all funnel
    // through the same 'updateKey' action with different `updates`, exactly
    // like the old forwardCommand-era handlers did with update_gemini_api_key. ──
    mutate('post', '/api/gemini/keys/:keyId/enable', {
        action: 'updateKey',
        getServerId: serverIdFromBody,
        buildPayload: (req) => ({ keyId: req.params.keyId, updates: { isActive: true } })
    });
    mutate('post', '/api/gemini/keys/:keyId/disable', {
        action: 'updateKey',
        getServerId: serverIdFromBody,
        buildPayload: (req) => ({ keyId: req.params.keyId, updates: { isActive: false } })
    });
    mutate('post', '/api/gemini/keys/:keyId/unblock', {
        action: 'updateKey',
        getServerId: serverIdFromBody,
        buildPayload: (req) => ({ keyId: req.params.keyId, updates: { isBlocked: false, blockedUntil: null, blockedReason: null } })
    });
}

module.exports = { register, MODULE };

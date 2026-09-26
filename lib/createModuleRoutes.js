// middleware/lib/createModuleRoutes.js
//
// DRY route-building helper shared by every modules/<name>/routes.js file.
// Not a rigid DSL — it's a thin wrapper around plain Express route
// registration that eliminates the ~10 lines of repeated boilerplate
// (auth guard, cache lookup, dispatchConfig call, response shape) that
// used to be copy-pasted for every single endpoint across the old
// 8000-line index.js. Modules with irregular routes (nested sub-resources,
// custom validation, multi-step flows) can still call `app.get/post/...`
// directly and reach for `dispatchConfig`/`moduleState` themselves — this
// helper covers the common 80% cleanly without boxing in the other 20%.

const { dispatchConfig } = require('./dispatchConfig');
const moduleState = require('./moduleState');

/**
 * @param {import('express').Express} app
 * @param {object} deps
 * @param {Function} deps.ensureAuthenticated
 * @param {string} moduleName
 */
function createModuleRoutes(app, { ensureAuthenticated }, moduleName) {
    /**
     * Register a read endpoint that serves the last known authoritative
     * state for this module+server straight from moduleState — no bot
     * round trip on the hot path. If nothing is cached yet, optionally
     * kick off a background refresh (fire-and-forget through the config
     * protocol) so the NEXT read is warm, without making this request wait.
     */
    function read(path, { warmOnMiss = null, transform, stateKey = moduleName, responseKey = 'config' } = {}) {
        app.get(path, ensureAuthenticated, async (req, res) => {
            const serverId = req.params.serverId;
            const cached = moduleState.get(stateKey, serverId);

            if (!cached && warmOnMiss) {
                // Fire-and-forget warm-up; the socket 'config:event' /
                // subsequent poll will pick up the result. We intentionally
                // do not await this so cache-miss reads stay fast. The bot
                // is always dispatched to via `moduleName` (its registered
                // ConfigBus handlers live under that name); `stateKey` only
                // controls which moduleState bucket the *cache* lands in,
                // so a module can expose several distinctly-shaped reads
                // (e.g. quarantine's config vs. its stats/users list)
                // without them clobbering each other.
                dispatchConfig(req, res_noop(), { serverId, module: moduleName, action: warmOnMiss, idempotent: true, stateKey }).catch(() => {});
            }

            const data = cached ? (transform ? transform(cached.data) : cached.data) : null;
            res.json({ success: true, data, [responseKey]: data, version: cached?.version ?? null, updatedAt: cached?.updatedAt ?? null });
        });
    }

    /**
     * Register a mutating endpoint (setup/update/delete/toggle/...) that
     * dispatches through the generic config protocol and returns the full
     * lifecycle result. `payload` may be a static object, or a function
     * `(req) => object` for building it from params/body/query.
     */
    function mutate(method, path, action, { payload, idempotent = false, expectedVersion, stateKey } = {}) {
        app[method](path, ensureAuthenticated, async (req, res) => {
            const serverId = req.params.serverId;
            const resolvedAction = typeof action === 'function' ? action(req) : action;
            let builtPayload;
            try {
                builtPayload = typeof payload === 'function' ? payload(req) : (payload || req.body);
            } catch (validationError) {
                return res.status(validationError.httpStatus || 400).json({ success: false, state: 'failed', error: 'validation_error', message: validationError.message });
            }
            const version = typeof expectedVersion === 'function' ? expectedVersion(req) : expectedVersion;

            await dispatchConfig(req, res, { serverId, module: moduleName, action: resolvedAction, payload: builtPayload, idempotent, expectedVersion: version, stateKey });
        });
    }

    // Convenience wrappers for the common verbs.
    const post = (path, action, opts) => mutate('post', path, action, opts);
    const put = (path, action, opts) => mutate('put', path, action, opts);
    const patch = (path, action, opts) => mutate('patch', path, action, opts);
    const del = (path, action, opts) => mutate('delete', path, action, opts);

    return { read, mutate, post, put, patch, delete: del };
}

// dispatchConfig always calls res.status().json() — when we deliberately
// don't want that (background warm-up), hand it a no-op stand-in so it
// can't throw on a real Express `res` that's already been used.
function res_noop() {
    const noop = () => noop;
    return { status: noop, json: noop };
}

module.exports = { createModuleRoutes };

// middleware/modules/rules/routes.js
//
// Rules templates are effectively global reference data returned by
// whichever bot answers, but the config protocol always needs a concrete
// serverId to route to a bot socket — so this still caches per-serverId
// like every other module (each server's dashboard gets its own cached
// copy of the same template list, which is harmless and keeps the caching
// logic uniform across the whole platform).
const MODULE = 'rules';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    const moduleState = require('../../lib/moduleState');

    routes.read('/api/server/:serverId/rules', { warmOnMiss: 'getTemplates', responseKey: 'templates', transform: (d) => d || [] });

    // No serverId in this legacy route — best-effort: return whichever
    // server's cached template list is available, since they're the same
    // global list regardless of which guild's bot originally answered.
    app.get('/api/rules/categories', ensureAuthenticated, (req, res) => {
        const templates = moduleState.getAny(MODULE)?.data || [];
        res.json({ success: true, templates, categories: templates.map((t) => ({ id: t.id, name: t.name, hasEmbed: true })) });
    });

    routes.post('/api/server/:serverId/rules/send', 'send', {
        payload: (req) => ({
            channelId: req.body.channelId,
            embedData: req.body.embedData,
            options: { messageContent: req.body.messageContent, mentionRoleId: req.body.mentionRoleId }
        })
    });
}

module.exports = { register, MODULE };

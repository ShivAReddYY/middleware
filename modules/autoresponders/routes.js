// middleware/modules/autoresponders/routes.js
const MODULE = 'autoresponders';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    routes.read('/api/server/:serverId/autoresponders', { warmOnMiss: 'get', responseKey: 'autoresponders', transform: (d) => d || [] });

    routes.post('/api/server/:serverId/autoresponders', 'create', {
        payload: (req) => ({
            userId: req.user.id,
            trigger: req.body.trigger,
            textResponse: req.body.textResponse,
            embedData: req.body.embedData,
            matchType: req.body.matchType,
            channels: req.body.channels,
            status: req.body.status
        })
    });

    routes.put('/api/server/:serverId/autoresponders/:id', 'update', {
        payload: (req) => ({ autoResponderId: req.params.id, updateData: req.body })
    });

    routes.patch('/api/server/:serverId/autoresponders/:id/status', (req) => (req.body.status ? 'activate' : 'deactivate'), {
        payload: (req) => ({ autoResponderId: req.params.id })
    });

    // NOTE: the old route did not scope this by userId (any authenticated
    // dashboard user with access to the server could delete any
    // autoresponder) — omitting userId here preserves that exact behavior,
    // since the bot-side handler only enforces ownership when userId is
    // truthy.
    routes.delete('/api/server/:serverId/autoresponders/:id', 'delete', {
        payload: (req) => ({ autoResponderId: req.params.id })
    });

    routes.post('/api/server/:serverId/autoresponders/disable', 'disableSystem');
}

module.exports = { register, MODULE };

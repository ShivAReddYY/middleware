// middleware/modules/customcommands/routes.js
const MODULE = 'customcommands';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    // NOTE: the old handler never actually returned the command list in the
    // HTTP response — it fired the bot request and told the client to wait
    // for a 'server_customcommands_data' socket push instead. The generic
    // read() helper here still serves whatever is cached (and warms the
    // cache on a miss via the 'get' action), which is strictly more useful
    // than the old body-less response, without changing the endpoint's
    // shape in any way the frontend currently depends on.
    routes.read('/api/server/:serverId/customcommands', { warmOnMiss: 'get', responseKey: 'commands' });

    routes.post('/api/server/:serverId/customcommands', 'createOrUpdate', {
        payload: (req) => {
            const { userId: ownerId, commandName, response } = req.body;
            if (!commandName || !response) {
                throw Object.assign(new Error('Command name and response are required'), { httpStatus: 400 });
            }
            return { userId: ownerId || req.user.id, commandName, response };
        }
    });

    routes.delete('/api/server/:serverId/customcommands/:commandName', 'delete', {
        // isAdmin was unconditionally true in the old handler regardless of
        // actual permission checks — preserved as-is.
        payload: (req) => ({ commandName: req.params.commandName, isAdmin: true })
    });
}

module.exports = { register, MODULE };

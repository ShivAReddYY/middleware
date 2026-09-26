// middleware/modules/quarantine/routes.js
const MODULE = 'quarantine';
const USERS_MODULE = 'quarantineUsers';
const STATS_MODULE = 'quarantineStats';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    // addUser/releaseUser/getQuarantinedUsers and getStats are registered on
    // the bot under their own module names (quarantineUsers/quarantineStats)
    // rather than under 'quarantine' — they need their own createModuleRoutes
    // instance so dispatch actually targets the right bot-side handler
    // (a bare `stateKey` override only renames the cache bucket, it does
    // NOT change which module the request is dispatched to).
    const users = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, USERS_MODULE);
    const stats = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, STATS_MODULE);

    routes.read('/api/server/:serverId/quarantine', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/quarantine', 'setup', {
        payload: (req) => ({
            quarantineRoleId: req.body.quarantineRoleId || null,
            quarantineChannelId: req.body.quarantineChannelId || null
        })
    });
    routes.post('/api/server/:serverId/quarantine/disable', 'disable');
    routes.put('/api/server/:serverId/quarantine', 'update');
    routes.delete('/api/server/:serverId/quarantine', 'delete');

    users.post('/api/server/:serverId/quarantine/user', 'addUser', {
        payload: (req) => {
            if (!req.body.userId) throw Object.assign(new Error('userId is required'), { httpStatus: 400 });
            return { userId: req.body.userId, reason: req.body.reason || 'No reason provided', moderatorId: req.user.id };
        }
    });
    users.delete('/api/server/:serverId/quarantine/user', 'releaseUser', {
        payload: (req) => ({ userId: req.body.userId })
    });

    users.read('/api/server/:serverId/quarantine/users', { warmOnMiss: 'getQuarantinedUsers', responseKey: 'users', transform: (d) => d || [] });
    stats.read('/api/server/:serverId/quarantine/stats', { warmOnMiss: 'getStats', responseKey: 'stats' });
}

module.exports = { register, MODULE };

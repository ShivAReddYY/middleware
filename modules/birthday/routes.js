// middleware/modules/birthday/routes.js
const MODULE = 'birthday';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    // Upcoming-birthdays lookup is its own module string on the bot side
    // (`birthdayUpcoming`) — kept as a separate createModuleRoutes instance
    // so it never shares a moduleState/cache bucket with the main config.
    const upcomingRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, 'birthdayUpcoming');

    routes.read('/api/server/:serverId/birthday', { warmOnMiss: 'get' });

    routes.post('/api/server/:serverId/birthday', 'setup');
    routes.put('/api/server/:serverId/birthday', 'update');
    routes.delete('/api/server/:serverId/birthday', 'delete');

    // The result depends on the `days` query param, so it isn't safe to
    // serve from a per-server cache the way routes.read() does — every call
    // dispatches straight to the bot for a fresh answer, same as the old
    // forwardCommand('get_upcoming_birthdays', ...) behavior.
    upcomingRoutes.mutate('get', '/api/server/:serverId/birthday/upcoming', 'get', {
        payload: (req) => ({ days: parseInt(req.query.days) || 30 })
    });
}

module.exports = { register, MODULE };

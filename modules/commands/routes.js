// middleware/modules/commands/routes.js
const MODULE = 'commands';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    // Command stats live under their own module string on the bot side
    // (`commandsStats`) so they get an isolated moduleState/cache bucket,
    // same reasoning as quarantine's stats/users split.
    const statsRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, 'commandsStats');

    routes.read('/api/server/:serverId/commands/disabled', {
        warmOnMiss: 'getDisabled',
        responseKey: 'commands',
        transform: (d) => Array.isArray(d) ? d : (Array.isArray(d?.commands) ? d.commands : [])
    });

    routes.post('/api/server/:serverId/commands/disable', 'disable');
    routes.post('/api/server/:serverId/commands/enable', 'enable');
    routes.post('/api/server/:serverId/commands/enable-all', 'enableAll');

    statsRoutes.read('/api/server/:serverId/commands/stats', { warmOnMiss: 'get', responseKey: 'stats' });
}

module.exports = { register, MODULE };

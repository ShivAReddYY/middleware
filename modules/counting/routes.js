// middleware/modules/counting/routes.js
const MODULE = 'counting';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    // countingModule.getCountingConfig() returns { success, config } (see
    // Bot/dashboard/modules/counting/counting.js) rather than the raw config
    // doc, so unwrap it here — the frontend (CountingList.tsx) expects
    // `data.config` to be the CountingConfig object itself.
    routes.read('/api/server/:serverId/counting', { warmOnMiss: 'get', transform: (d) => (d && typeof d === 'object' && 'config' in d) ? d.config : d });

    routes.post('/api/server/:serverId/counting', 'setup');
    routes.put('/api/server/:serverId/counting', 'update');
    routes.patch('/api/server/:serverId/counting/toggle', 'toggle');
    routes.delete('/api/server/:serverId/counting', 'delete');
}

module.exports = { register, MODULE };

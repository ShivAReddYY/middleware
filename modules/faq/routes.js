// middleware/modules/faq/routes.js
const MODULE = 'faq';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    // faqModule.getFaqConfig() returns { success, config } (see
    // Bot/dashboard/modules/faq/faq.js) rather than the raw config doc, so
    // unwrap it here — the frontend (FaqList.tsx) expects `data.config` to
    // be the FaqConfig object itself.
    routes.read('/api/server/:serverId/faq', { warmOnMiss: 'get', transform: (d) => (d && typeof d === 'object' && 'config' in d) ? d.config : d });

    routes.post('/api/server/:serverId/faq', 'setup');
    routes.put('/api/server/:serverId/faq', 'update');
    routes.patch('/api/server/:serverId/faq/toggle', 'toggle');
    routes.delete('/api/server/:serverId/faq', 'delete');
}

module.exports = { register, MODULE };

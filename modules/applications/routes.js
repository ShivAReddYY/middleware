// middleware/modules/applications/routes.js
const MODULE = 'applications';

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);

    // The applications list is keyed by server only (no sub-key), so it
    // fits the standard cache-first read pattern.
    routes.read('/api/server/:serverId/applications', { warmOnMiss: 'get', responseKey: 'applications', transform: (d) => d || [] });

    routes.post('/api/server/:serverId/applications', 'create', {
        payload: (req) => {
            if (!req.body.appName) throw Object.assign(new Error('Application name is required'), { httpStatus: 400 });
            return { appName: req.body.appName, mainChannel: req.body.mainChannel, responseChannel: req.body.responseChannel };
        }
    });

    routes.put('/api/server/:serverId/applications/:appName/channels', 'updateChannels', {
        payload: (req) => ({ appName: req.params.appName, mainChannel: req.body.mainChannel, responseChannel: req.body.responseChannel })
    });

    routes.patch('/api/server/:serverId/applications/:appName/status', (req) => (req.body.isActive ? 'activate' : 'deactivate'), {
        payload: (req) => ({ appName: req.params.appName })
    });

    routes.post('/api/server/:serverId/applications/:appName/questions', 'addQuestion', {
        payload: (req) => {
            if (!req.body.questionText) throw Object.assign(new Error('Question text is required'), { httpStatus: 400 });
            return {
                appName: req.params.appName,
                questionData: {
                    text: req.body.questionText.substring(0, 45), // Discord label limit
                    placeholder: req.body.placeholder ? req.body.placeholder.substring(0, 100) : '', // Discord placeholder limit
                    inputType: req.body.inputType || 'PARAGRAPH', // SHORT or PARAGRAPH
                    required: req.body.required !== false
                }
            };
        }
    });

    routes.put('/api/server/:serverId/applications/:appName/questions/:questionId', 'updateQuestion', {
        payload: (req) => ({
            appName: req.params.appName,
            questionId: req.params.questionId,
            updates: {
                text: req.body.text ? req.body.text.substring(0, 45) : undefined,
                placeholder: req.body.placeholder !== undefined ? req.body.placeholder.substring(0, 100) : undefined,
                inputType: req.body.inputType, // SHORT or PARAGRAPH
                required: req.body.required
            }
        })
    });

    routes.delete('/api/server/:serverId/applications/:appName/questions/:questionId', 'removeQuestion', {
        payload: (req) => ({ appName: req.params.appName, questionId: req.params.questionId })
    });

    routes.delete('/api/server/:serverId/applications/:appName', 'delete', {
        payload: (req) => ({ appName: req.params.appName })
    });

    routes.post('/api/server/:serverId/applications/disable', 'disableSystem');
}

module.exports = { register, MODULE };

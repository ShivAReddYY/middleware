// middleware/modules/serverlogs/routes.js
const MODULE = 'serverlogs';

const CHANNEL_ID_RE = /^\d{17,19}$/;

function register(app, { ensureAuthenticated }) {
    const routes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, MODULE);
    const statsRoutes = require('../../lib/createModuleRoutes').createModuleRoutes(app, { ensureAuthenticated }, 'serverlogsStats');

    routes.read('/api/server/:serverId/serverlogs', { warmOnMiss: 'get', responseKey: 'logConfigs', transform: (d) => d || [] });

    routes.post('/api/server/:serverId/serverlogs/event', 'setupEvent', {
        payload: (req) => {
            const { eventType, channelId } = req.body;
            if (!eventType || !channelId) throw Object.assign(new Error('eventType and channelId are required'), { httpStatus: 400 });
            if (!CHANNEL_ID_RE.test(channelId)) throw Object.assign(new Error('Invalid channel ID format'), { httpStatus: 400 });
            return { eventType, channelId };
        }
    });

    routes.post('/api/server/:serverId/serverlogs/all', 'setupAll', {
        payload: (req) => {
            const { channelId } = req.body;
            if (!channelId) throw Object.assign(new Error('channelId is required'), { httpStatus: 400 });
            if (!CHANNEL_ID_RE.test(channelId)) throw Object.assign(new Error('Invalid channel ID format'), { httpStatus: 400 });
            return { channelId };
        }
    });

    routes.put('/api/server/:serverId/serverlogs/event', 'updateEvent', {
        payload: (req) => {
            const { eventType, channelId } = req.body;
            if (!eventType || !channelId) throw Object.assign(new Error('eventType and channelId are required'), { httpStatus: 400 });
            if (!CHANNEL_ID_RE.test(channelId)) throw Object.assign(new Error('Invalid channel ID format'), { httpStatus: 400 });
            return { eventType, channelId };
        }
    });

    routes.delete('/api/server/:serverId/serverlogs/event/:eventType', 'deleteEvent', {
        payload: (req) => ({ eventType: req.params.eventType })
    });

    routes.delete('/api/server/:serverId/serverlogs', 'clearAll');

    statsRoutes.read('/api/server/:serverId/serverlogs/stats', { warmOnMiss: 'get', responseKey: 'stats' });

    // Static reference data — no bot round trip needed.
    app.get('/api/serverlogs/event-types', ensureAuthenticated, (req, res) => {
        res.json({
            success: true,
            eventTypes: [
                { value: 'messageDelete', name: 'Message Deleted' },
                { value: 'messageUpdate', name: 'Message Updated' },
                { value: 'memberJoin', name: 'Member Joined' },
                { value: 'memberLeave', name: 'Member Left' },
                { value: 'roleCreate', name: 'Role Created' },
                { value: 'roleDelete', name: 'Role Deleted' },
                { value: 'memberBan', name: 'Member Banned' },
                { value: 'memberUnban', name: 'Member Unbanned' },
                { value: 'voiceJoin', name: 'Voice Channel Joined' },
                { value: 'voiceLeave', name: 'Voice Channel Left' },
                { value: 'channelCreate', name: 'Channel Created' },
                { value: 'channelDelete', name: 'Channel Deleted' },
                { value: 'roleAssigned', name: 'Role Assigned to User' },
                { value: 'roleRemoved', name: 'Role Removed from User' },
                { value: 'nicknameChange', name: 'Nickname Changed' },
                { value: 'moderationLogs', name: 'Moderation Logs' }
            ]
        });
    });
}

module.exports = { register, MODULE };

// middleware/auth/routes.js
//
// Discord OAuth routes, session logout, and the /api/user identity
// endpoint. This is the ONLY place that knows about Passport/session
// mechanics — every other module just uses `ensureAuthenticated` +
// `req.user.id`.

const passport = require('passport');

function registerAuthRoutes(app, { debugLogger, FRONTEND_URL, REQUIRED_GUILD_ID, CLIENT_ID, CALLBACK_URL }) {
    app.get('/auth/discord', (req, res) => {
        debugLogger.logApiRequest('GET', '/auth/discord');
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: CALLBACK_URL,
            response_type: 'code',
            scope: 'identify guilds guilds.join',
            guild_id: REQUIRED_GUILD_ID || '',
            disable_guild_select: 'true'
        });
        res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
    });

    app.get('/auth/discord/callback',
        passport.authenticate('discord', { failureRedirect: `${FRONTEND_URL}/login` }),
        async (req, res) => {
            debugLogger.logApiRequest('GET', '/auth/discord/callback', {}, { status: 302, redirect: `${FRONTEND_URL}/dashboard`, userId: req.user?.id });

            if (req.user?.guilds && Array.isArray(req.user.guilds)) {
                req.session.userGuilds = req.user.guilds.map((g) => ({
                    id: g.id,
                    name: g.name,
                    owner: !!g.owner,
                    permissions: String(g.permissions || '0')
                }));
            } else {
                req.session.userGuilds = [];
            }

            req.session.save((err) => {
                if (err) console.error('❌ Session save error:', err);
                res.redirect(`${FRONTEND_URL}/dashboard`);
            });
        }
    );

    app.get('/auth/logout', (req, res) => {
        debugLogger.logApiRequest('GET', '/auth/logout');
        req.logout(() => res.redirect(`${FRONTEND_URL}/dashboard`));
    });

    app.get('/api/user', (req, res) => {
        if (req.isAuthenticated() && req.user) {
            debugLogger.logApiRequest('GET', '/api/user', {}, { status: 200, userId: req.user.id, username: req.user.username });
            res.header('Access-Control-Allow-Credentials', 'true');
            res.header('Access-Control-Allow-Origin', FRONTEND_URL);
            res.json({
                id: req.user.id, username: req.user.username, global_name: req.user.global_name,
                avatar: req.user.avatar, email: req.user.email, verified: req.user.verified
            });
        } else {
            debugLogger.logApiRequest('GET', '/api/user', {}, { status: 401, message: 'Unauthorized' });
            res.status(401).json({ error: 'Not authenticated', authenticated: false });
        }
    });
}

module.exports = { registerAuthRoutes };

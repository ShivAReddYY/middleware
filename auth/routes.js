// middleware/auth/routes.js
//
// Discord OAuth routes, session logout, and the /api/user identity
// endpoint. This is the ONLY place that knows about Passport/session
// mechanics — every other module just uses `ensureAuthenticated` +
// `req.user.id`.

const passport = require('passport');

function registerAuthRoutes(app, { debugLogger, FRONTEND_URL, REQUIRED_GUILD_ID, CLIENT_ID, CALLBACK_URL, isOriginAllowed }) {
    app.get('/auth/discord', (req, res) => {
        debugLogger.logApiRequest('GET', '/auth/discord');

        // Capture requesting origin from redirect query or referer
        let returnOrigin = FRONTEND_URL;
        if (req.query.redirect) {
            try {
                const url = new URL(req.query.redirect);
                if (isOriginAllowed && isOriginAllowed(url.origin)) {
                    returnOrigin = url.origin;
                }
            } catch (e) {}
        } else if (req.headers.referer) {
            try {
                const ref = new URL(req.headers.referer);
                if (isOriginAllowed && isOriginAllowed(ref.origin)) {
                    returnOrigin = ref.origin;
                }
            } catch (e) {}
        }

        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: CALLBACK_URL,
            response_type: 'code',
            scope: 'identify guilds guilds.join',
            guild_id: REQUIRED_GUILD_ID || '',
            disable_guild_select: 'true',
            state: returnOrigin
        });
        res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
    });

    app.get('/auth/discord/callback',
        passport.authenticate('discord', { failureRedirect: `${FRONTEND_URL}/login` }),
        async (req, res) => {
            let targetRedirect = `${FRONTEND_URL}/dashboard`;
            if (req.query.state) {
                try {
                    const parsed = new URL(req.query.state);
                    if (isOriginAllowed && isOriginAllowed(parsed.origin)) {
                        targetRedirect = `${parsed.origin}/dashboard`;
                    }
                } catch (e) {}
            }

            debugLogger.logApiRequest('GET', '/auth/discord/callback', {}, { status: 302, redirect: targetRedirect, userId: req.user?.id });

            // Permission checks use the bot's own cached guild data
            // (botRegistry.getGuildData / moduleState) rather than the
            // Discord API, so we don't need to fetch/store real guild
            // membership here — this eliminates Discord API rate limiting.
            req.session.userGuilds = [];

            req.session.save((err) => {
                if (err) console.error('❌ Session save error:', err);
                res.redirect(targetRedirect);
            });
        }
    );

    app.get('/auth/logout', (req, res) => {
        debugLogger.logApiRequest('GET', '/auth/logout');
        let targetRedirect = `${FRONTEND_URL}/dashboard`;
        if (req.headers.referer) {
            try {
                const ref = new URL(req.headers.referer);
                if (isOriginAllowed && isOriginAllowed(ref.origin)) {
                    targetRedirect = `${ref.origin}/dashboard`;
                }
            } catch (e) {}
        }
        req.logout(() => res.redirect(targetRedirect));
    });

    app.get('/api/user', (req, res) => {
        if (req.isAuthenticated() && req.user) {
            debugLogger.logApiRequest('GET', '/api/user', {}, { status: 200, userId: req.user.id, username: req.user.username });
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

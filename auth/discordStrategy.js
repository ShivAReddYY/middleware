// middleware/auth/discordStrategy.js
//
// Discord OAuth2 passport strategy + session serialization. Extracted
// verbatim from the old monolithic index.js.

const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

function initDiscordAuth({ debugLogger }) {
    const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
    const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
    const PORT = process.env.PORT || 10000;
    const CALLBACK_URL = process.env.DISCORD_CALLBACK_URL || `http://localhost:${PORT}/auth/discord/callback`;

    passport.serializeUser((user, done) => done(null, user));
    passport.deserializeUser((userObj, done) => {
        try {
            done(null, userObj);
        } catch (error) {
            done(error, null);
        }
    });

    passport.use(new DiscordStrategy({
        clientID: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        callbackURL: CALLBACK_URL,
        scope: ['identify', 'guilds', 'guilds.join'],
    }, (accessToken, refreshToken, profile, done) => {
        profile.accessToken = accessToken;

        debugLogger.logEvent('auth', 'discord_strategy_callback', {
            profileId: profile.id, username: profile.username,
            hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken
        });
        debugLogger.debugData.discord.authSessions.push({
            timestamp: new Date().toISOString(), userId: profile.id, username: profile.username, action: 'authenticated'
        });

        process.nextTick(() => done(null, profile));
    }));

    return { CLIENT_ID, CLIENT_SECRET, CALLBACK_URL };
}

module.exports = { initDiscordAuth };

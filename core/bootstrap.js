// middleware/core/bootstrap.js
//
// Boots the Express app, HTTP server, Socket.IO server, session store,
// rate limiting, and the core mongoose connection used for the platform's
// central database (users, sessions, API keys). This file has zero
// knowledge of any feature module — it hands back the raw primitives
// (`app`, `server`, `io`) plus shared singletons (`debugLogger`,
// `configProtocol`, `botRegistry`, `botHealth`) that every module wires
// itself into.

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const MongoStore = require('connect-mongo');
const { MongoClient } = require('mongodb');

const { DebugLogger } = require('./debugLogger');
const { ConfigProtocol } = require('../lib/configProtocol');
const { BotRegistry } = require('../lib/botRegistry');
const { BotHealth } = require('../lib/botHealth');

function createBootstrap() {
    const PORT = process.env.PORT || 10000;
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
    const MONGODB_URI = process.env.API_KEYS_MONGODB_URI;
    const REQUIRED_GUILD_ID = process.env.REQUIRED_GUILD_ID || null;
    const isProduction = process.env.NODE_ENV === 'production';

    const app = express();
    const server = http.createServer(app);

    const io = socketIo(server, {
        cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'], credentials: true }
    });

    const debugLogger = new DebugLogger({ port: PORT, frontendUrl: FRONTEND_URL });
    const configProtocol = new ConfigProtocol({ io, logger: console });
    const botRegistry = new BotRegistry({ io, requiredGuildId: REQUIRED_GUILD_ID });
    const botHealth = new BotHealth({ io });

    // ─── Rate limiting + CORS + JSON body ───
    app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 10000000, message: 'Too many requests from this IP, please try again later.' }));
    app.use(cors({ origin: FRONTEND_URL, credentials: true }));
    app.use(express.json({ limit: '10mb' }));
    app.set('trust proxy', 1);

    // ─── Central MongoDB (sessions, users, API keys) ───
    async function testMongoConnection() {
        try {
            const client = new MongoClient(MONGODB_URI);
            await client.connect();
            await client.db().admin().ping();
            await client.close();
        } catch (error) {
            console.error('❌ Direct MongoDB connection failed:', error.message);
        }
    }
    testMongoConnection();

    const sessionStore = MongoStore.create({
        mongoUrl: MONGODB_URI,
        collectionName: 'sessions',
        ttl: 7 * 24 * 60 * 60,
        touchAfter: 24 * 3600,
        stringify: false,
        autoRemove: 'native'
    });

    app.use(session({
        name: 'ssid',
        secret: process.env.SESSION_SECRET || 'super123-fallback-secret',
        resave: false,
        saveUninitialized: false,
        store: sessionStore,
        cookie: {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
            maxAge: 1000 * 60 * 60 * 24 * 7
        }
    }));

    app.use(passport.initialize());
    app.use(passport.session());

    mongoose.connect(MONGODB_URI)
        .then(() => {
            debugLogger.debugData.database.mongodb.connected = true;
            debugLogger.logEvent('database', 'mongodb_connected', { uri: '[REDACTED]' });
        })
        .catch((err) => {
            console.error('❌ MongoDB connection error:', err);
            debugLogger.debugData.database.mongodb.connected = false;
            debugLogger.debugData.database.mongodb.lastError = err.message;
            debugLogger.logError(err, 'MongoDB connection');
        });

    return {
        app, server, io,
        PORT, FRONTEND_URL, MONGODB_URI, REQUIRED_GUILD_ID, isProduction,
        debugLogger, configProtocol, botRegistry, botHealth
    };
}

module.exports = { createBootstrap };

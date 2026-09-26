// middleware/modules/protection/routes.js
//
// Three independent sub-features share this file — lock roles, role
// persist, and boycott bans — each with its own module string on the bot
// side, so each gets its own createModuleRoutes() instance.
const LOCK_ROLES_MODULE = 'protectionLockRoles';
const ROLE_PERSIST_MODULE = 'protectionRolePersist';
const BOYCOTT_BANS_MODULE = 'protectionBoycottBans';

function register(app, { ensureAuthenticated }) {
    const { createModuleRoutes } = require('../../lib/createModuleRoutes');
    const lockRoles = createModuleRoutes(app, { ensureAuthenticated }, LOCK_ROLES_MODULE);
    const rolePersist = createModuleRoutes(app, { ensureAuthenticated }, ROLE_PERSIST_MODULE);
    const boycottBans = createModuleRoutes(app, { ensureAuthenticated }, BOYCOTT_BANS_MODULE);

    // ── Lock Roles ──
    lockRoles.read('/api/server/:serverId/protection/lock-roles', {
        warmOnMiss: 'get',
        transform: (d) => d || { enabled: false, roles: [] }
    });
    lockRoles.post('/api/server/:serverId/protection/lock-roles', 'add', {
        payload: (req) => ({ roleId: req.body.roleId, addedBy: req.user.id })
    });
    lockRoles.delete('/api/server/:serverId/protection/lock-roles/:roleId', 'remove', {
        payload: (req) => ({ roleId: req.params.roleId })
    });
    lockRoles.post('/api/server/:serverId/protection/lock-roles/toggle', 'toggleSystem', {
        payload: (req) => ({ enabled: req.body.enabled })
    });

    // ── Role Persist ──
    rolePersist.read('/api/server/:serverId/protection/role-persist', {
        warmOnMiss: 'get',
        transform: (d) => d || { enabled: false, members: [] }
    });
    rolePersist.post('/api/server/:serverId/protection/role-persist/toggle', 'toggleSystem', {
        payload: (req) => ({ enabled: req.body.enabled })
    });

    // ── Boycott Bans ──
    boycottBans.read('/api/server/:serverId/protection/boycott-bans', {
        warmOnMiss: 'get',
        responseKey: 'bans',
        transform: (d) => d || []
    });
    boycottBans.post('/api/server/:serverId/protection/boycott-bans', 'add', {
        payload: (req) => ({ userId: req.body.targetUserId, protectedRoles: req.body.protectedRoles, reason: req.body.reason, addedBy: req.user.id })
    });
    boycottBans.delete('/api/server/:serverId/protection/boycott-bans/:targetUserId', 'remove', {
        payload: (req) => ({ userId: req.params.targetUserId })
    });
}

module.exports = { register, LOCK_ROLES_MODULE, ROLE_PERSIST_MODULE, BOYCOTT_BANS_MODULE };

// middleware/lib/moduleState.js
//
// Generic, module-agnostic authoritative-state registry. Replaces the ~40
// hand-rolled `Map()` variables that used to live at the top of index.js
// (botWelcomeConfigs, botTicketConfigs, botQuarantineConfigs, ...).
//
// Every module's "last known good state" for a given server lives here,
// keyed by (module, serverId). Each entry carries a monotonic `version`
// and `updatedAt` timestamp so the platform can:
//   - reject stale/out-of-order writes (optimistic concurrency)
//   - answer "give me everything you know about this server" in one shot
//     for reconnect/resync (see lib/configProtocol.js `dispatch` version
//     check and sockets/index.js `config:sync_request`)
//   - let the dashboard render instantly from cache while a fresh fetch is
//     in flight
//
// This is intentionally dumb storage — it has no idea what "welcome" or
// "quarantine" mean. Business logic stays on the bot; this is just a
// bounded, TTL-free (servers are finite) cache with versioning.

const MAX_SERVERS_PER_MODULE = 20000; // safety valve, not a real-world ceiling

class ModuleState {
    constructor() {
        /** @type {Map<string, Map<string, {data:any, version:number, updatedAt:number}>>} */
        this.store = new Map();
    }

    _bucket(moduleName) {
        let bucket = this.store.get(moduleName);
        if (!bucket) {
            bucket = new Map();
            this.store.set(moduleName, bucket);
        }
        return bucket;
    }

    /**
     * Read the last known state for a module+server. Returns null if never set.
     */
    get(moduleName, serverId) {
        return this._bucket(moduleName).get(String(serverId)) || null;
    }

    /**
     * Write fresh authoritative state (e.g. after a successful config:ack).
     * Always bumps the version and stamps updatedAt — the bot is the single
     * source of truth, so every successful ack overwrites unconditionally.
     */
    set(moduleName, serverId, data) {
        const bucket = this._bucket(moduleName);
        const key = String(serverId);
        const prev = bucket.get(key);
        const entry = {
            data,
            version: (prev?.version || 0) + 1,
            updatedAt: Date.now()
        };
        bucket.set(key, entry);
        this._boundBucket(bucket);
        return entry;
    }

    delete(moduleName, serverId) {
        this._bucket(moduleName).delete(String(serverId));
    }

    /**
     * Optimistic concurrency check: does `expectedVersion` still match what
     * we have cached? If we have no record yet, any expectedVersion is
     * accepted (nothing to conflict with).
     */
    isVersionCurrent(moduleName, serverId, expectedVersion) {
        if (expectedVersion === undefined || expectedVersion === null) return true;
        const entry = this.get(moduleName, serverId);
        if (!entry) return true;
        return entry.version === expectedVersion;
    }

    /**
     * Collect every module's last known state for one server — used to
     * hydrate a dashboard session in a single round trip after a page load,
     * reconnect, or middleware restart recovery.
     */
    getAllForServer(serverId) {
        const key = String(serverId);
        const out = {};
        for (const [moduleName, bucket] of this.store) {
            const entry = bucket.get(key);
            if (entry) out[moduleName] = entry;
        }
        return out;
    }

    /** Wipe all cached state for a server (e.g. bot removed from guild). */
    clearServer(serverId) {
        const key = String(serverId);
        for (const bucket of this.store.values()) {
            bucket.delete(key);
        }
    }

    getStats() {
        const perModule = {};
        for (const [moduleName, bucket] of this.store) {
            perModule[moduleName] = bucket.size;
        }
        return perModule;
    }

    /**
     * Return the first cached entry found for a module, regardless of
     * which server it's keyed under. Useful for reference data that's
     * effectively global but still cached per-server for uniformity (e.g.
     * rules templates) — any cached copy is as good as any other.
     */
    getAny(moduleName) {
        const bucket = this.store.get(moduleName);
        if (!bucket || bucket.size === 0) return null;
        return bucket.values().next().value;
    }

    _boundBucket(bucket) {
        if (bucket.size <= MAX_SERVERS_PER_MODULE) return;
        const oldestKey = bucket.keys().next().value;
        bucket.delete(oldestKey);
    }
}

// Singleton — one process-wide state registry.
module.exports = new ModuleState();

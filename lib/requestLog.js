// middleware/lib/requestLog.js
//
// Structured, bounded, in-memory event log for every config protocol
// request. Not a replacement for real observability tooling (Datadog,
// Grafana, etc.) — this is the "zero-dependency, works on a 500MB box"
// version: a ring buffer you can inspect via GET /api/admin/request-log
// and a rollup of per-module/action metrics (latency, failure rate,
// timeout rate) for a lightweight health dashboard.

const MAX_ENTRIES = 2000;

class RequestLog {
    constructor() {
        /** @type {Array<object>} ring buffer, oldest first */
        this.entries = [];

        /** @type {Map<string, {count:number, success:number, failed:number, timeout:number, totalMs:number}>} */
        this.metrics = new Map();
    }

    start({ requestId, module: moduleName, action, serverId, botId }) {
        this.entries.push({
            requestId, module: moduleName, action, serverId, botId,
            startedAt: Date.now(),
            completedAt: null,
            durationMs: null,
            state: 'pending',
            error: null
        });
        if (this.entries.length > MAX_ENTRIES) this.entries.shift();
    }

    complete({ requestId, state, error }) {
        // Search from the end — recent entries are far more likely to be
        // the ones completing (ring buffer is time-ordered).
        for (let i = this.entries.length - 1; i >= 0; i--) {
            const entry = this.entries[i];
            if (entry.requestId !== requestId) continue;

            entry.completedAt = Date.now();
            entry.durationMs = entry.completedAt - entry.startedAt;
            entry.state = state;
            entry.error = error || null;

            this._recordMetric(entry);
            return entry;
        }
        return null;
    }

    _recordMetric(entry) {
        const key = `${entry.module}:${entry.action}`;
        let m = this.metrics.get(key);
        if (!m) {
            m = { count: 0, success: 0, failed: 0, timeout: 0, totalMs: 0 };
            this.metrics.set(key, m);
        }
        m.count++;
        m.totalMs += entry.durationMs || 0;
        if (entry.state === 'success') m.success++;
        else if (entry.state === 'timeout') m.timeout++;
        else m.failed++;
    }

    getRecent(limit = 100) {
        return this.entries.slice(-limit);
    }

    getMetrics() {
        const out = {};
        for (const [key, m] of this.metrics) {
            out[key] = {
                count: m.count,
                successRate: m.count ? +(m.success / m.count * 100).toFixed(1) : 0,
                failureRate: m.count ? +(m.failed / m.count * 100).toFixed(1) : 0,
                timeoutRate: m.count ? +(m.timeout / m.count * 100).toFixed(1) : 0,
                avgLatencyMs: m.count ? Math.round(m.totalMs / m.count) : 0
            };
        }
        return out;
    }
}

module.exports = new RequestLog();

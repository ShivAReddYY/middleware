// middleware/lib/mountModules.js
//
// Discovers every `middleware/modules/<name>/routes.js` and mounts it.
// Adding a brand-new feature module to the platform means dropping a new
// folder here with a routes.js that exports a `register(app, deps)`
// function — nothing else in the codebase needs to change.

const fs = require('fs');
const path = require('path');

function mountModules(app, deps) {
    const modulesDir = path.join(__dirname, '..', 'modules');
    if (!fs.existsSync(modulesDir)) return [];

    const mounted = [];
    for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const routesPath = path.join(modulesDir, entry.name, 'routes.js');
        if (!fs.existsSync(routesPath)) continue;

        try {
            const mod = require(routesPath);
            if (typeof mod.register === 'function') {
                mod.register(app, deps);
                mounted.push(entry.name);
            } else {
                console.warn(`⚠️ modules/${entry.name}/routes.js does not export register(app, deps) — skipped`);
            }
        } catch (error) {
            console.error(`❌ Failed to mount module "${entry.name}":`, error);
        }
    }
    return mounted;
}

module.exports = { mountModules };

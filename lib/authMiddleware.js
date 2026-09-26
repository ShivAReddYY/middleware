// middleware/lib/authMiddleware.js
//
// Shared Express middleware used by every module's routes.js.

function createAuthMiddleware({ debugLogger }) {
    function ensureAuthenticated(req, res, next) {
        if (req.isAuthenticated && req.isAuthenticated()) return next();
        debugLogger.logApiRequest(req.method, req.originalUrl, {}, { status: 401, message: 'Unauthorized' });
        res.status(401).json({ message: 'Unauthorized' });
    }

    return { ensureAuthenticated };
}

module.exports = { createAuthMiddleware };

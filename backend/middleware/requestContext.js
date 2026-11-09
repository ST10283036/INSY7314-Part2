const crypto = require("node:crypto");
const logger = require("../utils/logger");

// Gives every request a correlation id (also returned as X-Request-Id) so the
// events from one request can be traced together, and logs rate-limit hits.
function requestContext(req, res, next) {
    const incoming = req.get("X-Request-Id");
    req.id = /^[A-Za-z0-9-]{8,64}$/.test(incoming || "") ? incoming : crypto.randomUUID();
    res.set("X-Request-Id", req.id);

    res.on("finish", () => {
        if (res.statusCode === 429) {
            logger.event("rate_limit_exceeded", { level: "warn", outcome: "blocked", req, status: 429 });
        }
    });

    next();
}

module.exports = requestContext;

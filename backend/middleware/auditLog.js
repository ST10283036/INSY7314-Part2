const { randomUUID } = require("node:crypto");

const EVENTS = new Set([
    "login_succeeded", "login_failed", "login_limited_or_locked", "logout_succeeded",
    "registration_succeeded", "booking_created", "transaction_created", "booking_cancelled",
    "authentication_rejected", "access_denied", "request_failed",
]);

// Explicit allowlist: never serialize a request, body, token, username, IP or error stack.
function writeEvent(event, requestId, status, durationMs, sink = console.log) {
    if (!EVENTS.has(event)) return;
    const record = {
        timestamp: new Date().toISOString(),
        service: "hustlehub-backend",
        event,
        requestId: /^[a-f0-9-]{36}$/i.test(requestId) ? requestId : randomUUID(),
        status: Number.isInteger(status) ? status : 500,
        durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0,
    };
    // A logging sink must not change the API response or throw into application code.
    try { sink(JSON.stringify(record)); } catch { /* Collector failure is isolated. */ }
}

function auditLog(req, res, next) {
    const requestId = randomUUID();
    const started = performance.now();
    const path = req.path;
    const method = req.method;
    res.set("X-Request-Id", requestId);
    res.once("finish", () => {
        const status = res.statusCode;
        const emit = (event) => writeEvent(event, requestId, status, performance.now() - started);
        if (status >= 500) return emit("request_failed");
        if (method === "POST" && path === "/api/auth/login") {
            return emit(status === 200 ? "login_succeeded"
                : status === 429 ? "login_limited_or_locked" : "login_failed");
        }
        if (status === 401) return emit("authentication_rejected");
        if (status === 403) return emit("access_denied");
        if (method === "POST" && path === "/api/auth/register" && status === 201) emit("registration_succeeded");
        if (method === "POST" && path === "/api/auth/logout" && status === 200) emit("logout_succeeded");
        if (method === "POST" && path === "/api/bookings" && status === 201) {
            emit("booking_created");
            emit("transaction_created");
        }
        if (method === "PATCH" && /^\/api\/bookings\/[a-f0-9]{24}\/cancel$/i.test(path) && status === 200) {
            emit("booking_cancelled");
        }
    });
    next();
}

module.exports = { auditLog, writeEvent };

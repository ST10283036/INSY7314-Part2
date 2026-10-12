const express = require("express");
const cors = require("cors");
const path = require("node:path");
const fs = require("node:fs");
const securityHeaders = require("./middleware/securityHeaders");
const { apiLimiter } = require("./middleware/rateLimiters");
const authenticateToken = require("./middleware/authenticateToken");
const errorHandler = require("./middleware/errorHandler");

const app = express();
const allowedOrigins = (process.env.FRONTEND_ORIGINS || "http://localhost:5173")
    .split(",").map((value) => value.trim()).filter(Boolean);
app.disable("x-powered-by");
// Direct local HTTPS has no trusted proxy. Do not trust arbitrary forwarded IP headers.
app.use(securityHeaders);
app.use(cors((req, callback) => {
    const origin = req.get("Origin");
    const ownOrigin = `${req.protocol}://${req.get("host")}`;
    if (origin && origin !== ownOrigin && !allowedOrigins.includes(origin)) {
        const error = new Error("Origin not allowed.");
        error.code = "CORS_ORIGIN_DENIED";
        return callback(error);
    }
    return callback(null, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["RateLimit", "RateLimit-Policy", "Retry-After"],
    credentials: false,
    });
}));
app.use("/api", apiLimiter, (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (Object.keys(req.query).length) {
        return res.status(400).json({ message: "Query parameters are not supported on this endpoint." });
    }
    if (["POST", "PUT", "PATCH"].includes(req.method) && !req.is("application/json")) {
        return res.status(415).json({ message: "Use application/json for this request." });
    }
    return next();
});
app.use(express.json({ limit: "10kb", strict: true }));
app.get("/api/health", (req, res) => res.json({
    status: "ok", service: "hustlehub-part2", protocol: req.secure ? "https" : "http",
}));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/gigs", require("./routes/gigRoutes"));
app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/income", require("./routes/incomeRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.get("/api/protected", authenticateToken, (req, res) => res.json({
    message: "Protected route accessed successfully.", user: req.user,
}));

// When Role 3 provides a build, serving it here applies CSP to the actual HTML.
if (process.env.FRONTEND_DIST_PATH) {
    const frontendDir = path.resolve(__dirname, process.env.FRONTEND_DIST_PATH);
    if (!fs.existsSync(path.join(frontendDir, "index.html"))) {
        throw new Error("Configured frontend build was not found.");
    }
    app.use(express.static(frontendDir, { dotfiles: "deny" }));
    app.get("/{*page}", (req, res, next) => {
        if (req.path.startsWith("/api")) return next();
        return res.sendFile(path.join(frontendDir, "index.html"));
    });
}
app.use((req, res) => res.status(404).json({ message: "Route not found." }));
app.use(errorHandler);

module.exports = app;

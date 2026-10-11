const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, ".env"),
    quiet: true,
});

const express = require("express");
const https = require("https");
const fs = require("fs");
const authRoutes = require("./routes/authRoutes");
const authenticateToken = require(
    "./middleware/authenticateToken"
);
const connectDatabase = require("./config/db");
const gigRoutes = require("./routes/gigRoutes");

const requiredSettings = [
    "JWT_SECRET",
    "JWT_EXPIRES_IN",
    "JWT_ISSUER",
    "JWT_AUDIENCE",
    "TLS_KEY_PATH",
    "TLS_CERT_PATH",
    "MONGO_URI"
];

const missingSettings = requiredSettings.filter(
    (setting) => !process.env[setting]
);

if (missingSettings.length > 0) {
    console.error(
        `Missing required environment setting(s): ${missingSettings.join(", ")}`
    );
    process.exit(1);
}

if (
    process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET.includes("replace_with")
) {
    console.error(
        "JWT_SECRET must be a genuine random secret of at least 32 characters."
    );
    process.exit(1);
}

const port = Number(process.env.PORT || 5000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("PORT must be a valid port number.");
    process.exit(1);
}

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb", strict: true }));

app.get("/api/health", (req, res) => {
    return res.status(200).json({
        status: "ok",
        protocol: "https",
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/gigs", gigRoutes);

app.get(
    "/api/protected",
    authenticateToken,
    (req, res) => {
        return res.status(200).json({
            message: "Protected route accessed successfully.",
            user: req.user,
        });
    }
);

app.use((req, res) => {
    return res.status(404).json({
        message: "Route not found.",
    });
});

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error.type === "entity.too.large") {
        return res.status(413).json({
            message: "Request body is too large.",
        });
    }

    if (error.type === "entity.parse.failed") {
        return res.status(400).json({
            message: "Invalid JSON body.",
        });
    }

    console.error("An unhandled request error occurred.");

    return res.status(500).json({
        message: "An unexpected error occurred.",
    });
});

async function startServer() {
    try {
        await connectDatabase();
    } catch {
        console.error(
            "Could not connect to the databse. Check that MongoDB is running and MONGO_URI is correct."
        );
        process.exit(1);
    }

    try {
        const httpsOptions = {
            key: fs.readFileSync(
                path.resolve(__dirname, process.env.TLS_KEY_PATH)
        ),
        cert: fs.readFileSync(
            path.resolve(__dirname, process.env.TLS_CERT_PATH)
        ),
    };

    https.createServer(httpsOptions, app).listen(
        port,
        () => {
            console.log(
                `HustleHub+ backend running securely at https://localhost:${port}`
            );
        });
    } catch {
        console.error(
            "HTTPS certificate files could not be loaded. Check the configured paths."
        );
        process.exit(1);
    }
}

startServer();
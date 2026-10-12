const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, ".env"),
    quiet: true,
});

const https = require("https");
const fs = require("fs");
const connectDatabase = require("./config/db");

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

const app = require("./app");

async function startServer() {
    try {
        await connectDatabase();
    } catch {
        console.error(
            "Could not connect to the database. Check MongoDB and MONGO_URI."
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

    const server = https.createServer(httpsOptions, app);
    server.on("error", (error) => {
        console.error(error.code === "EADDRINUSE"
            ? "The configured port is already in use. Stop the existing server first."
            : "HTTPS server could not start.");
        process.exit(1);
    });
    server.listen(
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

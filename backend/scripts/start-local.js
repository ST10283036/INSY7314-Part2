const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { MongoMemoryServer } = require("mongodb-memory-server");

async function start() {
    const directory = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "HustleHub-Part2", "mongo");
    fs.mkdirSync(directory, { recursive: true });
    const database = await MongoMemoryServer.create({
        instance: { port: 27018, dbPath: directory, storageEngine: "wiredTiger" },
    });
    if (new URL(database.getUri()).port !== "27018") {
        await database.stop({ doCleanup: false });
        throw new Error("Port 27018 must be free for the local demonstration database.");
    }
    process.env.MONGO_URI = database.getUri("hustlehub_local");
    process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString("base64url");
    process.env.JWT_EXPIRES_IN = "1h";
    process.env.JWT_ISSUER = "hustlehub-plus";
    process.env.JWT_AUDIENCE = "hustlehub-plus-api";
    process.env.TLS_KEY_PATH = "certs/localhost-key.pem";
    process.env.TLS_CERT_PATH = "certs/localhost-cert.pem";
    process.env.PORT = process.env.PORT || "5000";
    if (!process.env.FRONTEND_DIST_PATH &&
        fs.existsSync(path.join(__dirname, "../../frontend/dist/index.html"))) {
        process.env.FRONTEND_DIST_PATH = "../frontend/dist";
    }
    console.log("Starting the local development database and HTTPS API.");
    const stop = async () => { await database.stop({ doCleanup: false }); process.exit(0); };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    require("../server");
}
start().catch(() => {
    console.error("Local startup failed. Check that ports 27018 and 5000 are free and the TLS certificate exists.");
    process.exitCode = 1;
});

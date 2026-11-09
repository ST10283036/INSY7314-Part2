const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { MongoMemoryServer } = require("mongodb-memory-server");

async function main() {
    const root = path.join(__dirname, "../..");
    if (!fs.existsSync(path.join(root, "frontend/dist/index.html"))) {
        throw new Error("Build the frontend first: npm run build in frontend.");
    }
    const setup = spawnSync(process.execPath, [path.join(__dirname, "setup-local.js")], {
        stdio: "inherit", windowsHide: true,
    });
    if (setup.status !== 0) throw new Error("Local certificate setup failed.");
    process.env.FRONTEND_DIST_PATH = "../frontend/dist";
    process.env.JWT_SECRET = crypto.randomBytes(48).toString("base64url");
    process.env.JWT_ISSUER = "part3-recording";
    process.env.JWT_AUDIENCE = "part3-recording-api";
    process.env.JWT_EXPIRES_IN = "1h";
    const mongo = await MongoMemoryServer.create();
    let server;
    async function stop() {
        if (server?.listening) {
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
        }
        await mongoose.disconnect();
        await mongo.stop();
    }
    try {
        await mongoose.connect(mongo.getUri(), { dbName: "part3_recording_only" });
        const User = require("../models/User");
        const password = `${crypto.randomBytes(15).toString("base64url")}aA1!`;
        const passwordHash = await bcrypt.hash(password, 12);
        await User.create([
            { username: "video_freelancer", passwordHash, role: "freelancer" },
            { username: "video_client", passwordHash, role: "client" },
        ]);
        server = https.createServer({
            key: fs.readFileSync(path.join(__dirname, "../certs/localhost-key.pem")),
            cert: fs.readFileSync(path.join(__dirname, "../certs/localhost-cert.pem")),
        }, require("../app"));
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(5443, "127.0.0.1", resolve);
        });
        const directory = path.join(root, ".private-evidence");
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, "part3-recording-accounts.txt"),
            `LOCAL RECORDING ONLY - DO NOT COMMIT OR SHOW ON VIDEO\n\n` +
            `Website: https://localhost:5443\n` +
            `Freelancer username: video_freelancer\nClient username: video_client\n` +
            `Password for both: ${password}\n\n` +
            `Accounts and recordings data are temporary. Restarting clears this database and changes the password.\n` +
            `No shared group accounts are used. Keep this terminal open while recording.\n`, { mode: 0o600 });
        console.log("Recording website ready: https://localhost:5443");
        console.log("Private accounts: .private-evidence/part3-recording-accounts.txt (repository root).");
        console.log("Keep this terminal open. Ctrl+C stops the server and removes only its temporary database.");
        const shutdown = () => stop().then(() => process.exit(0), () => process.exit(1));
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
    } catch (error) {
        await stop();
        throw error;
    }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });

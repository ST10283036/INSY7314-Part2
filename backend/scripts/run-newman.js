const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const https = require("node:https");
const mongoose = require("mongoose");
const newman = require("newman");
const { MongoMemoryServer } = require("mongodb-memory-server");

async function run() {
    process.env.JWT_SECRET = crypto.randomBytes(48).toString("base64url");
    process.env.JWT_ISSUER = "newman-test";
    process.env.JWT_AUDIENCE = "newman-test-api";
    process.env.JWT_EXPIRES_IN = "1h";
    const mongo = await MongoMemoryServer.create();
    let server;
    try {
        await mongoose.connect(mongo.getUri(), { dbName: "newman_security_test" });
        await require("../models/User").init();
        const certPath = path.join(__dirname, "../certs/localhost-cert.pem");
        server = https.createServer({
            cert: fs.readFileSync(certPath),
            key: fs.readFileSync(path.join(__dirname, "../certs/localhost-key.pem")),
        }, require("../app"));
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const summary = await new Promise((resolve, reject) => newman.run({
            collection: path.join(__dirname, "../../security/Part2-Security.postman_collection.json"),
            envVar: [{ key: "baseUrl", value: `https://127.0.0.1:${server.address().port}` }],
            sslExtraCaCerts: certPath,
            reporters: ["cli"],
            timeoutRequest: 5000,
        }, (error, result) => error ? reject(error) : resolve(result)));
        const evidence = {
            completedAt: new Date().toISOString(),
            tool: "Newman",
            scope: "Dedicated local MongoDB and verified HTTPS",
            stats: summary.run.stats,
            failures: summary.run.failures.map((failure) => ({
                request: failure.source && failure.source.name,
                test: failure.error && failure.error.test,
            })),
        };
        const evidenceDir = path.join(__dirname, "../../security/evidence");
        fs.mkdirSync(evidenceDir, { recursive: true });
        fs.writeFileSync(path.join(evidenceDir, "newman-summary.json"), JSON.stringify(evidence, null, 2));
        if (summary.run.failures.length) process.exitCode = 1;
    } finally {
        if (server) {
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
        }
        await mongoose.disconnect();
        await mongo.stop();
    }
}
run().catch(() => { console.error("Newman security execution failed; check local setup and retry."); process.exitCode = 1; });

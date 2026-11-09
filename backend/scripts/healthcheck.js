const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const request = https.get("https://localhost:5000/api/health", {
    ca: fs.readFileSync(path.resolve(__dirname, "..", process.env.TLS_CERT_PATH)),
    timeout: 4000,
}, (response) => {
    response.resume();
    process.exitCode = response.statusCode === 200 ? 0 : 1;
});
request.on("timeout", () => request.destroy());
request.on("error", () => { process.exitCode = 1; });

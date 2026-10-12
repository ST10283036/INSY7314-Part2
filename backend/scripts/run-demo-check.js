const path = require("node:path");
const newman = require("newman");

newman.run({
    collection: path.join(__dirname, "../../security/Part2-Demo.postman_collection.json"),
    environment: path.join(__dirname, "../../.private-evidence/demo.postman_environment.json"),
    sslExtraCaCerts: path.join(__dirname, "../certs/localhost-cert.pem"),
    reporters: ["cli"], timeoutRequest: 5000,
}, (error, result) => {
    if (error || result.run.failures.length) process.exitCode = 1;
});

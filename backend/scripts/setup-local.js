const fs = require("node:fs");
const path = require("node:path");
const selfsigned = require("selfsigned");

async function setup() {
    const directory = path.join(__dirname, "../certs");
    const keyPath = path.join(directory, "localhost-key.pem");
    const certPath = path.join(directory, "localhost-cert.pem");
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        console.log("The existing local TLS certificate was preserved.");
        return;
    }
    if (fs.existsSync(keyPath) || fs.existsSync(certPath)) {
        throw new Error("An incomplete existing certificate pair must be checked before setup.");
    }
    const generated = await selfsigned.generate([{ name: "commonName", value: "localhost" }], {
        keySize: 2048,
        algorithm: "sha256",
        notAfterDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        extensions: [
            { name: "basicConstraints", cA: true },
            { name: "keyUsage", keyCertSign: true, digitalSignature: true, keyEncipherment: true },
            { name: "subjectAltName", altNames: [
                { type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" },
            ] },
        ],
    });
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(keyPath, generated.private, { flag: "wx", mode: 0o600 });
    fs.writeFileSync(certPath, generated.cert, { flag: "wx" });
    console.log("Created an ignored local certificate for localhost and 127.0.0.1.");
}
setup().catch((error) => { console.error(error.message); process.exitCode = 1; });

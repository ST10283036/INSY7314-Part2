const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const https = require("node:https");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

async function main() {
    const cert = fs.readFileSync(path.join(__dirname, "../certs/localhost-cert.pem"));
    const password = `${crypto.randomBytes(16).toString("base64url")}aA1!`;
    const suffix = crypto.randomBytes(3).toString("hex");
    const values = { baseUrl: "https://localhost:5000", demoPassword: password };
    async function request(route, body, token) {
        return new Promise((resolve, reject) => {
            const data = body === undefined ? "" : JSON.stringify(body);
            const req = https.request({ hostname: "127.0.0.1", servername: "localhost", port: 5000,
                path: route, method: body === undefined ? "GET" : "POST", ca: cert,
                headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data),
                    ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            }, (res) => {
                let content = "";
                res.on("data", (chunk) => { content += chunk; });
                res.on("end", () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        reject(new Error(`Demo request ${route} failed with status ${res.statusCode}.`));
                    } else resolve(JSON.parse(content));
                });
            });
            req.on("error", reject);
            req.end(data);
        });
    }

    const health = await request("/api/health");
    if (health.service !== "hustlehub-part2") throw new Error("Port 5000 is not the Part 2 API.");

    for (const [name, role] of [["clientA", "client"], ["clientB", "client"],
        ["freelancerA", "freelancer"], ["freelancerB", "freelancer"]]) {
        const username = `demo_${name.toLowerCase()}_${suffix}`;
        await request("/api/auth/register", { username, password, role });
        const login = await request("/api/auth/login", { username, password });
        values[name] = username;
        values[`${name}Token`] = login.token;
    }
    // Admin provisioning is restricted to the local demonstration database.
    await mongoose.connect("mongodb://127.0.0.1:27018/hustlehub_local");
    const User = require("../models/User");
    const adminUsername = `demo_admin_${suffix}`;
    await User.create({ username: adminUsername, passwordHash: await bcrypt.hash(password, 12), role: "admin" });
    values.adminToken = (await request("/api/auth/login", { username: adminUsername, password })).token;
    const gig = await request("/api/gigs", { title: "Logo design", description: "A professional logo design service.", price: 125.50 }, values.freelancerAToken);
    values.gigId = gig.gig.id;
    values.bookingId = (await request("/api/bookings", { gigId: values.gigId }, values.clientAToken)).booking.id;
    const directory = path.join(__dirname, "../../.private-evidence");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "demo.postman_environment.json"), JSON.stringify({
        name: "HustleHub Part 2 - Local Demo",
        values: Object.entries(values).map(([key, value]) => ({ key, value, enabled: true,
            type: key.includes("Token") || key === "demoPassword" ? "secret" : "default" })),
        _postman_variable_scope: "environment",
    }, null, 2));
    console.log("Demo accounts and records are ready. Import .private-evidence/demo.postman_environment.json privately into Postman.");
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const https = require("node:https");
const http = require("node:http");
const { spawn } = require("node:child_process");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const root = path.join(__dirname, "../..");
const privateDir = path.join(root, ".private-evidence/zap");
const evidenceDir = path.join(root, "security/evidence");
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const apiKey = crypto.randomBytes(24).toString("hex");
const focused = process.argv.includes("--focused");
const password = `${crypto.randomBytes(18).toString("base64url")}aA1!`;
const privateValues = [apiKey, password];
let zapUrl;

function findFile(directory, match, depth = 3) {
    if (!fs.existsSync(directory) || depth < 0) return null;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isFile() && match(entry.name)) return full;
        if (entry.isDirectory()) {
            const found = findFile(full, match, depth - 1);
            if (found) return found;
        }
    }
    return null;
}

async function api(component, type, action, parameters = {}) {
    const url = new URL(`${zapUrl}/JSON/${component}/${type}/${action}/`);
    url.search = new URLSearchParams({ apikey: apiKey, ...parameters });
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    if (!response.ok || result.code) {
        throw new Error(`ZAP ${component}/${action} failed (${result.code || response.status}).`);
    }
    return result;
}

function redact(text) {
    for (const value of privateValues) text = text.split(value).join("[REDACTED]");
    return text.replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[REDACTED JWT]");
}

async function availablePort() {
    const server = http.createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    return port;
}

async function main() {
    const java = findFile(path.join(root, ".local-tools/java17"), (name) => name === "java.exe");
    const jar = findFile(path.join(root, ".local-tools/zap"), (name) => /^zap-[0-9.]+\.jar$/.test(name));
    if (!java || !jar) throw new Error("Run scripts/setup-zap.ps1 first.");
    fs.mkdirSync(privateDir, { recursive: true });
    fs.mkdirSync(evidenceDir, { recursive: true });
    process.env.JWT_SECRET = crypto.randomBytes(48).toString("base64url");
    process.env.JWT_ISSUER = "zap-security-test";
    process.env.JWT_AUDIENCE = "zap-security-test-api";
    process.env.JWT_EXPIRES_IN = "1h";
    privateValues.push(process.env.JWT_SECRET);
    const mongo = await MongoMemoryServer.create();
    let server;
    let zap;
    const log = fs.createWriteStream(path.join(privateDir, "daemon.log"));
    const summary = { startedAt: new Date().toISOString(), tool: "ZAP 2.17.0",
        profile: focused ? "API injection follow-up" : "Default policy", phases: [] };
    try {
        await mongoose.connect(mongo.getUri(), { dbName: "zap_security_test" });
        const User = require("../models/User");
        await User.init();
        const cert = fs.readFileSync(path.join(__dirname, "../certs/localhost-cert.pem"));
        server = https.createServer({
            cert, key: fs.readFileSync(path.join(__dirname, "../certs/localhost-key.pem")),
        }, require("../app"));
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const port = server.address().port;
        const baseUrl = `https://127.0.0.1:${port}`;
        const scope = `https://127\\.0\\.0\\.1:${port}/api(?:/.*)?`;

        async function target(method, route, body, token) {
            return new Promise((resolve, reject) => {
                const data = body === undefined ? null : JSON.stringify(body);
                const req = https.request({
                    hostname: "127.0.0.1", port, method, path: route, ca: cert,
                    headers: { "Content-Type": "application/json",
                        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
                        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                }, (res) => {
                    let content = "";
                    res.on("data", (chunk) => { content += chunk; });
                    res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(content) }));
                });
                req.on("error", reject);
                if (data) req.write(data);
                req.end();
            });
        }

        const users = {};
        for (const [name, role] of [["zap_client", "client"], ["zap_freelancer", "freelancer"]]) {
            if ((await target("POST", "/api/auth/register", { username: name, password, role })).status !== 201) {
                throw new Error("ZAP account preparation failed.");
            }
            const login = await target("POST", "/api/auth/login", { username: name, password });
            if (login.status !== 200) throw new Error("ZAP authentication failed.");
            users[role] = login.body;
            privateValues.push(login.body.token);
        }
        const hash = (await User.findById(users.client.user.id).select("+passwordHash")).passwordHash;
        await User.create({ username: "zap_admin", passwordHash: hash, role: "admin" });
        users.admin = (await target("POST", "/api/auth/login", { username: "zap_admin", password })).body;
        privateValues.push(users.admin.token);
        const gig = await target("POST", "/api/gigs", {
            title: "ZAP test service", description: "A disposable service for local security scanning.", price: 125.50,
        }, users.freelancer.token);
        if (gig.status !== 201) throw new Error("ZAP gig preparation failed.");
        const gigId = gig.body.gig.id;
        const booking = await target("POST", "/api/bookings", { gigId }, users.client.token);
        if (booking.status !== 201) throw new Error("ZAP booking preparation failed.");
        const bookingId = booking.body.booking.id;

        const zapPort = await availablePort();
        zapUrl = `http://127.0.0.1:${zapPort}`;
        zap = spawn(java, ["-Xmx512m", "-jar", jar, "-daemon", "-silent",
            "-host", "127.0.0.1", "-port", String(zapPort),
            "-dir", path.join(privateDir, "home"), "-config", `api.key=${apiKey}`],
        { cwd: path.dirname(jar), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        zap.stdout.pipe(log);
        zap.stderr.pipe(log, { end: false });
        let ready = false;
        for (let attempt = 0; attempt < 90; attempt += 1) {
            if (zap.exitCode !== null) throw new Error("ZAP stopped before startup completed.");
            try { await api("core", "view", "version"); ready = true; break; } catch { await sleep(1000); }
        }
        if (!ready) throw new Error("ZAP startup timed out.");

        if (focused) {
            const scanners = (await api("ascan", "view", "scanners")).scanners;
            const selected = scanners.filter((scanner) =>
                /^(SQL Injection|Cross Site Scripting \(Reflected\))$/i.test(scanner.name) ||
                /NoSQL|MongoDB/i.test(scanner.name));
            if (selected.length < 2) throw new Error("The required injection rules were not available.");
            summary.selectedScanners = selected.map(({ id, name }) => ({ id, name }));
            await api("ascan", "action", "disableAllScanners");
            await api("ascan", "action", "enableScanners", { ids: selected.map((scanner) => scanner.id).join(",") });
            await api("ascan", "action", "setOptionTargetParamsInjectable", { Integer: "3" });
            await api("ascan", "action", "setOptionTargetParamsEnabledRPC", { Integer: "39" });
        }

        const phases = [
            { name: "anonymous", routes: [
                ["GET", "/api/health", undefined, 200],
                ["GET", "/api/protected", undefined, 401],
                ["POST", "/api/auth/login", { username: "zap_client", password: "IncorrectDemo1!" }, 401],
                ["POST", "/api/auth/register", { username: "zap_denied_admin", password, role: "admin" }, 400],
            ] },
            { name: "client", token: users.client.token, routes: [
                ["GET", "/api/protected", undefined, 200],
                ["GET", "/api/gigs", undefined, 200],
                ["GET", "/api/bookings/mine", undefined, 200],
                ["GET", `/api/bookings/${bookingId}`, undefined, 200],
                ["POST", "/api/bookings", { gigId }, 201],
            ] },
            { name: "freelancer", token: users.freelancer.token, routes: [
                ["GET", "/api/protected", undefined, 200],
                ["GET", "/api/gigs/mine", undefined, 200],
                ["GET", "/api/income", undefined, 200],
                ["POST", "/api/gigs", { title: "Scan service", description: "A disposable description for the scanner.", price: 50 }, 201],
                ["PUT", `/api/gigs/${gigId}`, { title: "ZAP test service" }, 200],
            ] },
            { name: "admin", token: users.admin.token, routes: [
                ["GET", "/api/protected", undefined, 200],
                ["GET", "/api/admin/summary", undefined, 200],
            ] },
        ];

        for (const phase of phases) {
            if (focused && !["client", "freelancer"].includes(phase.name)) continue;
            const reportName = `zap-${phase.name}${focused ? "-focused" : ""}`;
            console.log(`ZAP: preparing ${phase.name} scope.`);
            await api("core", "action", "newSession", { name: "", overwrite: "true" });
            await api("context", "action", "newContext", { contextName: phase.name });
            await api("context", "action", "includeInContext", { contextName: phase.name, regex: scope });
            await api("context", "action", "setContextInScope", { contextName: phase.name, booleanInScope: "true" });
            await api("core", "action", "setMode", { mode: "protect" });
            await api("pscan", "action", "setScanOnlyInScope", { onlyInScope: "true" });
            if (phase.token) {
                await api("replacer", "action", "addRule", {
                    description: `role-${phase.name}`, enabled: "true", matchType: "REQ_HEADER",
                    matchRegex: "false", matchString: "Authorization",
                    replacement: `Bearer ${phase.token}`, url: scope,
                });
            }

            const captured = [];
            for (const [method, route, body, expected] of phase.routes) {
                const data = body === undefined ? "" : JSON.stringify(body);
                const raw = `${method} ${baseUrl}${route} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
                    (phase.token ? `Authorization: Bearer ${phase.token}\r\n` : "") +
                    (data ? `Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(data)}\r\n` : "") +
                    `\r\n${data}`;
                const response = await api("core", "action", "sendRequest", { request: raw, followRedirects: "false" });
                const messages = response.sendRequest || response.messages || [];
                const status = Number((messages[0] && messages[0].responseHeader || "").match(/HTTP\/\S+\s+(\d+)/)?.[1]);
                if (status !== expected) throw new Error(`ZAP ${phase.name} seed ${method} ${route} returned ${status}; expected ${expected}.`);
                captured.push({ method, route, status });
            }

            await api("ascan", "action", "setOptionThreadPerHost", { Integer: "1" });
            await api("ascan", "action", "setOptionDelayInMs", { Integer: "3000" });
            await api("ascan", "action", "setOptionMaxRuleDurationInMins", { Integer: "1" });
            await api("ascan", "action", "setOptionMaxScanDurationInMins", { Integer: "2" });
            const started = await api("ascan", "action", "scan", {
                url: `${baseUrl}/api`, recurse: "true", inScopeOnly: "true",
            });
            const scanId = started.scan;
            console.log(`ZAP: running ${phase.name} active scan (two-minute budget).`);
            let status = "0";
            const deadline = Date.now() + 180000;
            while (Date.now() < deadline) {
                status = (await api("ascan", "view", "status", { scanId })).status;
                if (status === "100") break;
                await sleep(2000);
            }
            if (status !== "100") await api("ascan", "action", "stop", { scanId });
            for (let attempt = 0; attempt < 30; attempt += 1) {
                if (Number((await api("pscan", "view", "recordsToScan")).recordsToScan) === 0) break;
                await sleep(1000);
            }
            const alerts = (await api("core", "view", "alerts", { baseurl: baseUrl, start: "0", count: "1000" })).alerts;
            const observations = alerts.map((alert) => ({
                name: alert.name || alert.alert, risk: alert.risk, confidence: alert.confidence,
                url: alert.url, parameter: alert.param, solution: alert.solution,
            }));
            const result = {
                role: phase.name, contextScope: scope, seedResponses: captured,
                activeScanStatus: status, activeScanBudgetMinutes: 2,
                delayMilliseconds: 3000, alerts: observations,
                limitation: "Bounded active scan; rate limits remain enabled. Not an exhaustive penetration test.",
            };
            fs.writeFileSync(path.join(evidenceDir, `${reportName}.json`), redact(JSON.stringify(result, null, 2)));
            const reportResponse = await fetch(`${zapUrl}/OTHER/core/other/htmlreport/?apikey=${apiKey}`);
            if (!reportResponse.ok) throw new Error("The ZAP HTML report could not be retrieved.");
            const report = await reportResponse.text();
            if (!report.toLowerCase().includes("<html")) throw new Error("ZAP did not return an HTML report.");
            fs.writeFileSync(path.join(privateDir, `${reportName}.raw.html`), report);
            fs.writeFileSync(path.join(evidenceDir, `${reportName}.html`), redact(report));
            summary.phases.push(result);
            console.log(`ZAP: ${phase.name} results saved (${observations.length} alerts).`);
            if (phase.token) await api("replacer", "action", "removeRule", { description: `role-${phase.name}` });
        }
        summary.completedAt = new Date().toISOString();
        fs.writeFileSync(path.join(evidenceDir, focused ? "zap-focused-summary.json" : "zap-summary.json"), redact(JSON.stringify(summary, null, 2)));
        console.log("ZAP reports saved. Review findings and scan limitations before submission.");
    } finally {
        if (zap && zap.exitCode === null) {
            try { await api("core", "action", "shutdown"); } catch { zap.kill(); }
        }
        log.end();
        if (server) {
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
        }
        await mongoose.disconnect();
        await mongo.stop();
    }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });

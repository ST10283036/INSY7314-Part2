const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const https = require("node:https");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { chromium } = require("playwright-core");

async function main() {
    const root = path.join(__dirname, "../..");
    const dist = path.join(root, "frontend/dist");
    if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error("Build the frontend first.");
    process.env.FRONTEND_DIST_PATH = "../frontend/dist";
    process.env.JWT_SECRET = crypto.randomBytes(48).toString("base64url");
    process.env.JWT_ISSUER = "browser-security-test";
    process.env.JWT_AUDIENCE = "browser-security-test-api";
    process.env.JWT_EXPIRES_IN = "1h";
    const mongo = await MongoMemoryServer.create();
    let server;
    let browser;
    let zap;
    const results = [];
    const violations = [];
    const shots = path.join(root, "security/evidence/screenshots");
    fs.mkdirSync(shots, { recursive: true });
    try {
        await mongoose.connect(mongo.getUri(), { dbName: "browser_security_test" });
        await require("../models/User").init();
        server = https.createServer({
            cert: fs.readFileSync(path.join(__dirname, "../certs/localhost-cert.pem")),
            key: fs.readFileSync(path.join(__dirname, "../certs/localhost-key.pem")),
        }, require("../app"));
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const baseUrl = `https://127.0.0.1:${server.address().port}`;
        if (process.argv.includes("--zap")) {
            zap = await require("./browser-zap")(root, baseUrl);
        }
        browser = await chromium.launch({ channel: "chrome", headless: true });
        // Only this isolated loopback browser context accepts the local self-signed cert.
        // Newman separately checks HTTPS with the actual CA certificate.
        const context = await browser.newContext({ ignoreHTTPSErrors: true,
            ...(zap ? { proxy: zap.proxy } : {}), viewport: { width: 1280, height: 900 } });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        await page.exposeFunction("recordCsp", (event) => violations.push(event));
        await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (event) => {
            window.recordCsp({ directive: event.effectiveDirective, blocked: event.blockedURI });
        }));
        let dialogs = 0;
        page.on("dialog", async (dialog) => { dialogs += 1; await dialog.dismiss(); });
        const password = `${crypto.randomBytes(16).toString("base64url")}aA1!`;
        const suffix = crypto.randomBytes(3).toString("hex");

        console.log("Browser: checking frontend HTML and CSP.");
        const first = await page.goto(`${baseUrl}/register`);
        assert.equal(first.status(), 200);
        assert.match(first.headers()["content-security-policy"], /script-src 'self'/);
        await page.getByRole("heading", { name: "Create an account" }).waitFor();
        results.push("React registration page renders under the served CSP");

        async function registerAndLogin(name, role) {
            await page.goto(`${baseUrl}/register`);
            await page.getByLabel("Username", { exact: true }).fill(name);
            await page.locator('input[type="password"]').fill(password);
            await page.getByRole("combobox").selectOption(role);
            const registration = page.waitForResponse((response) => response.url().endsWith("/api/auth/register"));
            await page.getByRole("button", { name: "Register", exact: true }).click();
            assert.equal((await registration).status(), 201);
            await page.waitForURL(/\/login$/);
            await page.getByLabel("Username", { exact: true }).fill(name);
            await page.locator('input[type="password"]').fill(password);
            const login = page.waitForResponse((response) => response.url().endsWith("/api/auth/login"));
            await page.getByRole("button", { name: "Log in", exact: true }).click();
            assert.equal((await login).status(), 200);
            await page.waitForURL(/\/gigs$/);
            await page.getByRole("heading", { name: "Browse Gigs", exact: true }).waitFor();
        }

        console.log("Browser: checking freelancer registration and login.");
        await registerAndLogin(`ui_f_${suffix}`, "freelancer");
        results.push("Freelancer registration and login use the same-origin HTTPS API");
        console.log("Browser: checking sanitised gig creation.");
        await page.goto(`${baseUrl}/my-gigs`);
        await page.getByLabel("Title", { exact: true }).fill("<script>alert(1)</script><b>Safe service</b>");
        await page.getByLabel("Description", { exact: true }).fill("An ordinary secure service description.");
        await page.getByLabel("Price (ZAR)", { exact: true }).fill("125.50");
        const create = page.waitForResponse((response) => response.url().endsWith("/api/gigs") && response.request().method() === "POST");
        await page.getByRole("button", { name: "Create Gig", exact: true }).click();
        const created = await create;
        assert.equal(created.status(), 201);
        assert.equal((await created.json()).gig.title, "Safe service");
        await page.getByRole("heading", { name: "Safe service", exact: true }).waitFor();
        assert.equal(dialogs, 0);
        results.push("Gig input is sanitised and scripting payloads do not execute");
        await page.screenshot({ path: path.join(shots, "P2-Browser-Sanitised-Gig.png") });

        await page.evaluate(() => { localStorage.clear(); });
        console.log("Browser: checking client registration and role restrictions.");
        await registerAndLogin(`ui_c_${suffix}`, "client");
        results.push("Client registration and login work under CSP");
        await page.evaluate(() => {
            const user = JSON.parse(localStorage.getItem("user"));
            user.role = "freelancer";
            localStorage.setItem("user", JSON.stringify(user));
        });
        await page.goto(`${baseUrl}/my-gigs`);
        await page.getByText("Could not load your gigs.", { exact: true }).waitFor();
        await page.getByLabel("Title", { exact: true }).fill("Denied client service");
        await page.getByLabel("Description", { exact: true }).fill("This record must never be created.");
        await page.getByLabel("Price (ZAR)", { exact: true }).fill("50");
        const denied = page.waitForResponse((response) => response.url().endsWith("/api/gigs") && response.request().method() === "POST");
        await page.getByRole("button", { name: "Create Gig", exact: true }).click();
        assert.equal((await denied).status(), 403);
        await page.getByText("You do not have permission to perform this action.", { exact: true }).waitFor();
        assert.equal(await require("../models/Gig").countDocuments({ title: "Denied client service" }), 0);
        results.push("Forging the browser role cannot grant backend freelancer permissions");
        await page.screenshot({ path: path.join(shots, "P2-Browser-Role-Denied.png") });
        assert.equal(violations.length, 0);
        results.push("No CSP violation events occurred during the tested flows");

        if (zap) { await zap.finish(password); await zap.stop(); }
        const report = path.join(root, zap ? "security/evidence/zap-frontend.html" : "security/evidence/zap-client-focused.html");
        if (fs.existsSync(report)) {
            await page.goto(pathToFileURL(report).href);
            await page.screenshot({ path: path.join(shots, "P2-ZAP-Report.png") });
        }
        fs.writeFileSync(path.join(root, "security/evidence/browser-security.json"), JSON.stringify({
            completedAt: new Date().toISOString(), browser: "Google Chrome", passed: results.length,
            cases: results, cspViolationCount: violations.length,
            tlsNote: "Self-signed certificate accepted only in the isolated local browser context; Newman verifies the CA separately.",
        }, null, 2));
        console.log(`Browser security checks passed: ${results.length}; CSP violations: ${violations.length}.`);
    } finally {
        if (zap) await zap.stop();
        if (browser) await browser.close();
        if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
        await mongoose.disconnect();
        await mongo.stop();
    }
}
main().catch((error) => {
    const directory = path.join(__dirname, "../../.private-evidence");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "browser-error.log"), error.message);
    console.error("Browser security verification failed; details are in the ignored browser-error.log.");
    process.exitCode = 1;
});

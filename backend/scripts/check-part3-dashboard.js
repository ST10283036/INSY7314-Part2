const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { chromium } = require("playwright-core");

async function main() {
    const root = path.join(__dirname, "../..");
    const evidence = path.join(root, "security/evidence/part3");
    fs.mkdirSync(evidence, { recursive: true });
    process.env.FRONTEND_DIST_PATH = "../frontend/dist";
    process.env.JWT_SECRET = crypto.randomBytes(48).toString("base64url");
    process.env.JWT_ISSUER = "part3-dashboard-check";
    process.env.JWT_AUDIENCE = "part3-dashboard-api";
    process.env.JWT_EXPIRES_IN = "1h";
    const mongo = await MongoMemoryServer.create();
    let server;
    let browser;
    const cases = [];
    const violations = [];
    try {
        await mongoose.connect(mongo.getUri(), { dbName: "part3_dashboard_check" });
        await require("../models/User").init();
        server = https.createServer({
            cert: fs.readFileSync(path.join(__dirname, "../certs/localhost-cert.pem")),
            key: fs.readFileSync(path.join(__dirname, "../certs/localhost-key.pem")),
        }, require("../app"));
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const base = `https://127.0.0.1:${server.address().port}`;
        browser = await chromium.launch({ channel: "chrome", headless: true });
        const options = { ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } };
        const freeContext = await browser.newContext(options);
        const clientContext = await browser.newContext(options);
        for (const context of [freeContext, clientContext]) {
            await context.exposeFunction("recordCsp", (event) => violations.push(event));
            await context.addInitScript(() => document.addEventListener("securitypolicyviolation", (event) => {
                window.recordCsp(event.effectiveDirective);
            }));
        }
        const freelancer = await freeContext.newPage();
        const client = await clientContext.newPage();
        const suffix = crypto.randomBytes(3).toString("hex");
        const password = `${crypto.randomBytes(18).toString("base64url")}aA1!`;

        async function register(page, role) {
            const username = `dashboard_${role}_${suffix}`;
            await page.goto(`${base}/register`);
            await page.getByLabel("Username", { exact: true }).fill(username);
            await page.locator('input[type="password"]').fill(password);
            await page.getByRole("combobox").selectOption(role);
            await page.getByRole("button", { name: "Register", exact: true }).click();
            await page.waitForURL(/\/login$/);
            await page.getByLabel("Username", { exact: true }).fill(username);
            await page.locator('input[type="password"]').fill(password);
            await page.getByRole("button", { name: "Log in", exact: true }).click();
            await page.waitForURL(/\/gigs$/);
        }

        await register(freelancer, "freelancer");
        await freelancer.getByRole("link", { name: "Income", exact: true }).click();
        await freelancer.getByText("No income recorded in this tax year yet.").waitFor();
        cases.push("A new freelancer sees zero income and a clear empty tax-year state");
        await freelancer.getByRole("link", { name: "My Gigs", exact: true }).click();
        await freelancer.getByLabel("Title", { exact: true }).fill("Annual design service");
        await freelancer.getByLabel("Description", { exact: true }).fill("A fictional service used to verify the progressive tax estimate.");
        await freelancer.getByLabel("Price (ZAR)", { exact: true }).fill("300000");
        await freelancer.getByRole("button", { name: "Create Gig", exact: true }).click();
        await freelancer.getByRole("heading", { name: "Annual design service" }).waitFor();
        await register(client, "client");
        await client.getByRole("button", { name: "Book", exact: true }).click();
        await client.getByText('Booked "Annual design service". View it in My Bookings.').waitFor();
        await client.getByRole("link", { name: "My Bookings", exact: true }).click();
        await client.getByRole("button", { name: "View details" }).click();
        await client.getByText(/Transaction: R300000.*completed/).waitFor();
        cases.push("Browser registration, login, gig creation, client booking and transaction recording work together");
        await freelancer.getByRole("link", { name: "Income", exact: true }).click();
        await freelancer.getByText("Effective tax rate: 13.52%").waitFor();
        assert.match(await freelancer.getByRole("region", { name: "Estimated income tax" }).innerText(), /R40\s572[.,]00/);
        assert.match(await freelancer.getByRole("region", { name: "Income after estimated tax" }).innerText(), /R259\s428[.,]00/);
        assert.equal(await freelancer.locator(".income-bar").count(), 12);
        cases.push("Real API income of R300000 displays R40572 tax, 13.52% effective rate and R259428 net income");
        await freelancer.getByText("View monthly amounts", { exact: true }).click();
        assert.equal(await freelancer.getByRole("table", { name: /Monthly income for tax year/ }).getByRole("row").count(), 13);
        await freelancer.getByText("View monthly amounts", { exact: true }).click();
        await freelancer.getByText("View tax bracket breakdown", { exact: true }).click();
        assert.equal(await freelancer.getByRole("table", { name: /Progressive tax calculation/ }).getByRole("row").count(), 8);
        await freelancer.getByText("View tax bracket breakdown", { exact: true }).click();
        await freelancer.screenshot({ path: path.join(evidence, "income-dashboard-desktop.png"), fullPage: true });
        cases.push("All twelve monthly totals and all seven tax brackets are accessible through the dashboard");
        await freelancer.setViewportSize({ width: 390, height: 844 });
        assert.equal(await freelancer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        await freelancer.screenshot({ path: path.join(evidence, "income-dashboard-mobile.png"), fullPage: true });
        cases.push("The dashboard fits a 390-pixel mobile viewport without page overflow");
        await client.goto(`${base}/income`);
        await client.getByText("You do not have permission to view this page.").waitFor();
        cases.push("Clients cannot access the freelancer dashboard");
        const token = await freelancer.evaluate(() => localStorage.getItem("token"));
        const logoutResponse = freelancer.waitForResponse((response) => response.url().endsWith("/api/auth/logout"));
        await freelancer.getByRole("button", { name: /log ?out/i }).click();
        assert.equal((await logoutResponse).status(), 200);
        const rejected = await freeContext.request.get(`${base}/api/income`, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(rejected.status(), 401);
        cases.push("Frontend logout revokes the test user's old token on the real backend");
        assert.deepEqual(violations, []);
        cases.push("No CSP violations occurred during the tested browser flows");
        fs.writeFileSync(path.join(evidence, "dashboard-browser-results.json"), JSON.stringify({
            completedAt: new Date().toISOString(), tool: "Playwright / Google Chrome",
            database: "Isolated temporary MongoDB; no shared demo accounts used",
            passed: cases.length, cases, cspViolations: violations.length,
            tlsNote: "Only this isolated loopback browser context accepts the self-signed certificate.",
        }, null, 2) + "\n");
        console.log(`Part 3 browser checks passed: ${cases.length}. Screenshots and results saved under security/evidence/part3.`);
    } finally {
        if (browser) await browser.close();
        if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
        await mongoose.disconnect();
        await mongo.stop();
    }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });

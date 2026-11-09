const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");

if (process.env.GITHUB_ACTIONS !== "true") throw new Error("Run only against the disposable CI stack.");
const ca = fs.readFileSync(path.resolve(__dirname, "../certs/localhost-cert.pem"));
const checks = [];
function request(method, endpoint, expected, body, token) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const req = https.request(`https://localhost:8443${endpoint}`, {
            method, ca, timeout: 10000,
            headers: {
                ...(payload ? { "Content-Type": "application/json" } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        }, (res) => {
            let raw = "";
            res.on("data", (chunk) => { raw += chunk; });
            res.on("end", () => {
                try {
                    assert.equal(res.statusCode, expected, `${method} ${endpoint}: unexpected status`);
                    checks.push({ method, endpoint: endpoint.replace(/[a-f0-9]{24}/g, ":id"), status: res.statusCode });
                    resolve({ body: res.headers["content-type"]?.includes("application/json") ? JSON.parse(raw) : raw, headers: res.headers });
                } catch (error) { reject(error); }
            });
        });
        req.on("timeout", () => req.destroy(new Error("HTTPS request timed out")));
        req.on("error", reject);
        req.end(payload);
    });
}

async function main() {
    const page = await request("GET", "/income", 200);
    assert.match(page.body, /id="root"/);
    assert.match(page.headers["content-security-policy"], /default-src 'self'/);
    const health = await request("GET", "/api/health", 200);
    assert.equal(health.body.protocol, "https");
    await request("GET", "/api/protected", 401);
    const password = `${randomBytes(24).toString("hex")}aA1!`;
    const tokens = {};
    for (const role of ["client", "freelancer"]) {
        const username = `ci_${role}_${randomBytes(4).toString("hex")}`;
        await request("POST", "/api/auth/register", 201, { username, password, role });
        await request("POST", "/api/auth/login", 401, { username, password: `${password}wrong` });
        tokens[role] = (await request("POST", "/api/auth/login", 200, { username, password })).body.token;
    }
    const gig = (await request("POST", "/api/gigs", 201, {
        title: "CI annual design service", description: "Disposable integration test service.", price: 300000,
    }, tokens.freelancer)).body.gig;
    const booking = (await request("POST", "/api/bookings", 201, { gigId: gig.id }, tokens.client)).body;
    assert.equal(booking.transaction.amount, 300000);
    const details = (await request("GET", `/api/bookings/${booking.booking.id}`, 200, undefined, tokens.client)).body;
    assert.equal(details.transaction.amount, 300000);
    const income = (await request("GET", "/api/income", 200, undefined, tokens.freelancer)).body;
    assert.equal(income.taxYearIncome, 300000);
    assert.equal(income.monthlyIncome.length, 12);
    assert.equal(income.taxBreakdown.length, 7);
    await request("GET", "/api/income", 403, undefined, tokens.client);
    await request("POST", "/api/auth/logout", 200, {}, tokens.client);
    await request("GET", "/api/protected", 401, undefined, tokens.client);
    const dir = path.resolve(__dirname, "../../security/evidence/part3-ci");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "compose-checks.json"), JSON.stringify({
        completedAt: new Date().toISOString(), passed: checks.length,
        scope: "HTTPS frontend proxy to backend and MongoDB; disposable CI accounts only", checks,
    }, null, 2));
    console.log(`Full-stack HTTPS checks passed: ${checks.length}. No credentials included in evidence.`);
}
main().catch(() => { console.error("Full-stack integration checks failed; inspect container health and safe logs."); process.exitCode = 1; });

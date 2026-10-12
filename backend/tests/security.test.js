const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const supertest = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.JWT_SECRET = crypto.randomBytes(48).toString("base64url");
process.env.JWT_EXPIRES_IN = "1h";
process.env.JWT_ISSUER = "security-test";
process.env.JWT_AUDIENCE = "security-test-api";
process.env.FRONTEND_ORIGINS = "http://localhost:5173";

const app = require("../app");
const User = require("../models/User");
const Gig = require("../models/Gig");
const Booking = require("../models/Booking");
const Transaction = require("../models/Transaction");
const { loginLimiter, registrationLimiter, bookingLimiter } = require("../middleware/rateLimiters");
const password = `${crypto.randomBytes(18).toString("base64url")}aA1!`;
const accounts = {};
let mongo;
let server;
let request;
let gigId;
let bookingId;

before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: "security_test" });
    await User.init();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    request = supertest(server);
    for (const [name, role] of [["client_a", "client"], ["client_b", "client"],
        ["freelancer_a", "freelancer"], ["freelancer_b", "freelancer"]]) {
        const created = await request.post("/api/auth/register").send({ username: name, password, role });
        assert.equal(created.status, 201);
        const loggedIn = await request.post("/api/auth/login").send({ username: name, password });
        assert.equal(loggedIn.status, 200);
        accounts[name] = { ...loggedIn.body.user, token: loggedIn.body.token };
    }
    const stored = await User.findById(accounts.client_a.id).select("+passwordHash");
    const admin = await User.create({ username: "test_admin", passwordHash: stored.passwordHash, role: "admin" });
    const signed = jwt.sign({ id: admin.id, role: "admin" }, process.env.JWT_SECRET, {
        algorithm: "HS256", issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE,
        subject: admin.id, expiresIn: "1h",
    });
    accounts.admin = { id: admin.id, role: "admin", token: signed };
    const gig = await request.post("/api/gigs").set("Authorization", bearer("freelancer_a"))
        .send({ title: "Logo design", description: "A professional logo design service.", price: 125.50 });
    assert.equal(gig.status, 201);
    gigId = gig.body.gig.id;
}, { timeout: 240000 });

beforeEach(() => {
    loginLimiter.resetKey("127.0.0.1");
    registrationLimiter.resetKey("127.0.0.1");
    for (const account of Object.values(accounts)) bookingLimiter.resetKey(`user:${account.id}`);
});

after(async () => {
    if (server) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
});

function bearer(name) { return `Bearer ${accounts[name].token}`; }
function sign(claims = {}, options = {}) {
    return jwt.sign({ id: accounts.client_a.id, role: "client", ...claims }, process.env.JWT_SECRET, {
        algorithm: "HS256", issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE,
        subject: accounts.client_a.id, expiresIn: "1h", ...options,
    });
}

test("Helmet sets restrictive headers without wildcard or unsafe script permissions", async () => {
    const result = await request.get("/api/health");
    assert.equal(result.status, 200);
    assert.equal(result.headers["x-content-type-options"], "nosniff");
    assert.equal(result.headers["x-frame-options"], "DENY");
    assert.equal(result.headers["referrer-policy"], "no-referrer");
    assert.equal(result.headers["cache-control"], "no-store");
    assert.equal(result.headers["x-powered-by"], undefined);
    assert.match(result.headers["strict-transport-security"], /max-age=31536000/);
    assert.match(result.headers["content-security-policy"], /script-src 'self'/);
    assert.match(result.headers["content-security-policy"], /frame-ancestors 'none'/);
    assert.doesNotMatch(result.headers["content-security-policy"], /unsafe-inline|unsafe-eval|\*/);
});

test("CORS permits the agreed frontend and denies unapproved origins", async () => {
    const allowed = await request.options("/api/gigs").set("Origin", "http://localhost:5173")
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "authorization,content-type");
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers["access-control-allow-origin"], "http://localhost:5173");
    const sameOrigin = await request.post("/api/auth/login")
        .set("Origin", `http://127.0.0.1:${server.address().port}`)
        .send({ username: "unmatched_user", password: "WrongDemo1!" });
    assert.equal(sameOrigin.status, 401);
    const denied = await request.get("/api/health").set("Origin", "https://untrusted.example");
    assert.equal(denied.status, 403);
    assert.deepEqual(denied.body, { message: "Request origin is not allowed." });
});

test("passwords are bcrypt hashes and are excluded from normal user queries", async () => {
    const user = await User.findById(accounts.client_a.id);
    assert.equal(user.passwordHash, undefined);
    const secretRecord = await User.findById(user.id).select("+passwordHash");
    assert.match(secretRecord.passwordHash, /^\$2[aby]\$12\$/);
    assert.equal(secretRecord.password, undefined);
});

test("registration denies admin roles and unknown owner fields", async () => {
    for (const fields of [{ role: "admin" }, { role: { $ne: null } }, { freelancer: accounts.freelancer_a.id }]) {
        const result = await request.post("/api/auth/register").send({ username: "privilege_attempt", password, ...fields });
        assert.equal(result.status, 400);
        assert.equal(await User.countDocuments({ username: "privilege_attempt" }), 0);
    }
});

test("duplicate usernames and incorrect login receive controlled responses", async () => {
    assert.equal((await request.post("/api/auth/register").send({ username: "CLIENT_A", password })).status, 409);
    const wrong = await request.post("/api/auth/login").send({ username: "client_a", password: "WrongDemo1!" });
    const absent = await request.post("/api/auth/login").send({ username: "absent_user", password: "WrongDemo1!" });
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrong.body, absent.body);
});

test("credentials reject MongoDB operator objects without echoing input", async () => {
    const result = await request.post("/api/auth/login").send({ username: { $ne: null }, password: "WrongDemo1!" });
    assert.equal(result.status, 400);
    assert.doesNotMatch(JSON.stringify(result.body), /WrongDemo1|\$ne/);
});

test("all marketplace routes reject missing authentication", async () => {
    for (const route of ["/api/gigs", "/api/bookings/mine", "/api/income", "/api/admin/summary", "/api/protected"]) {
        assert.equal((await request.get(route)).status, 401);
    }
});

test("JWT rejects altered, expired, wrong issuer/audience/algorithm and mismatched subject tokens", async () => {
    const invalid = [
        `${accounts.client_a.token}x`,
        sign({}, { expiresIn: -10 }),
        sign({}, { issuer: "wrong" }),
        sign({}, { audience: "wrong" }),
        sign({}, { algorithm: "HS384" }),
        sign({}, { subject: accounts.client_b.id }),
        sign({ role: "unknown" }),
    ];
    for (const token of invalid) {
        const result = await request.get("/api/protected").set("Authorization", `Bearer ${token}`);
        assert.equal(result.status, 401);
        assert.deepEqual(result.body, { message: "Authentication required." });
    }
    const noExpiry = jwt.sign({ id: accounts.client_a.id, role: "client" }, process.env.JWT_SECRET, {
        issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, subject: accounts.client_a.id,
    });
    assert.equal((await request.get("/api/protected").set("Authorization", `Bearer ${noExpiry}`)).status, 401);
});

test("database roles override outdated JWT role claims", async () => {
    const claimedAdmin = sign({ role: "admin" });
    const result = await request.get("/api/admin/summary").set("Authorization", `Bearer ${claimedAdmin}`);
    assert.equal(result.status, 403);
});

test("disabled and deleted users cannot reuse previously valid tokens", async () => {
    await User.updateOne({ _id: accounts.client_b.id }, { isActive: false });
    try {
        assert.equal((await request.get("/api/protected").set("Authorization", bearer("client_b"))).status, 401);
    } finally {
        await User.updateOne({ _id: accounts.client_b.id }, { isActive: true });
    }
    const deletedId = new mongoose.Types.ObjectId().toString();
    const nonexistent = sign({ id: deletedId }, { subject: deletedId });
    assert.equal((await request.get("/api/protected").set("Authorization", `Bearer ${nonexistent}`)).status, 401);
});

test("clients and admins cannot perform freelancer-only gig mutations", async () => {
    for (const name of ["client_a", "admin"]) {
        const result = await request.post("/api/gigs").set("Authorization", bearer(name))
            .send({ title: "Forbidden gig", description: "This must never be created.", price: 50 });
        assert.equal(result.status, 403);
    }
});

test("cross-owner gig updates and deletion are denied and leave the record unchanged", async () => {
    const update = await request.put(`/api/gigs/${gigId}`).set("Authorization", bearer("freelancer_b"))
        .send({ title: "Changed by stranger" });
    const removed = await request.delete(`/api/gigs/${gigId}`).set("Authorization", bearer("freelancer_b"));
    assert.equal(update.status, 404);
    assert.equal(removed.status, 404);
    assert.equal((await Gig.findById(gigId)).title, "Logo design");
});

test("gig owners can update their records and unavailable gigs are private", async () => {
    const result = await request.put(`/api/gigs/${gigId}`).set("Authorization", bearer("freelancer_a"))
        .send({ isAvailable: false });
    assert.equal(result.status, 200);
    assert.equal(result.body.gig.isAvailable, false);
    assert.equal((await request.get(`/api/gigs/${gigId}`).set("Authorization", bearer("freelancer_b"))).status, 404);
    assert.equal((await request.get(`/api/gigs/${gigId}`).set("Authorization", bearer("freelancer_a"))).status, 200);
    await Gig.updateOne({ _id: gigId }, { isAvailable: true });
});

test("gig input strips scripting/HTML before storage", async () => {
    const result = await request.post("/api/gigs").set("Authorization", bearer("freelancer_a"))
        .send({ title: "<script>alert(1)</script><b>Safe title</b>",
            description: "<img src=x onerror=alert(1)>Ordinary description text.", price: 50 });
    assert.equal(result.status, 201);
    assert.equal(result.body.gig.title, "Safe title");
    assert.equal(result.body.gig.description, "Ordinary description text.");
    const stored = await Gig.findById(result.body.gig.id);
    assert.doesNotMatch(stored.description, /<|onerror|alert/);
});

test("gig validators reject unknown fields, object inputs, invalid money and availability types", async () => {
    const valid = { title: "Safe title", description: "Ordinary description text.", price: 50 };
    for (const payload of [{ ...valid, freelancer: accounts.freelancer_b.id },
        { ...valid, title: { $ne: null } }, { ...valid, price: "50" },
        { ...valid, price: -1 }, { ...valid, price: 1.001 },
        { ...valid, title: "<script>alert(1)</script>" }]) {
        assert.equal((await request.post("/api/gigs").set("Authorization", bearer("freelancer_a")).send(payload)).status, 400);
    }
    for (const payload of [{}, { isAvailable: "false" }, { isAvailable: {} }, { price: { $gt: 0 } }]) {
        assert.equal((await request.put(`/api/gigs/${gigId}`).set("Authorization", bearer("freelancer_a")).send(payload)).status, 400);
    }
});

test("invalid IDs, query manipulation, malformed JSON and incorrect media types fail safely", async () => {
    assert.equal((await request.get("/api/gigs/not-an-id").set("Authorization", bearer("client_a"))).status, 400);
    assert.equal((await request.get("/api/income?freelancer=someone-else").set("Authorization", bearer("freelancer_a"))).status, 400);
    assert.equal((await request.post("/api/auth/login").set("Content-Type", "application/json").send("{")).status, 400);
    assert.equal((await request.post("/api/auth/login").set("Content-Type", "text/plain").send("hello")).status, 415);
    assert.equal((await request.post("/api/auth/login").send({ value: "x".repeat(11000) })).status, 413);
});

test("freelancers cannot book and clients cannot read freelancer income", async () => {
    assert.equal((await request.post("/api/bookings").set("Authorization", bearer("freelancer_a")).send({ gigId })).status, 403);
    assert.equal((await request.get("/api/income").set("Authorization", bearer("client_a"))).status, 403);
});

test("booking ownership and amounts come from stored records, never client-supplied fields", async () => {
    for (const extra of [{ price: 1 }, { amount: 1 }, { client: accounts.client_b.id }, { freelancer: accounts.freelancer_b.id }]) {
        assert.equal((await request.post("/api/bookings").set("Authorization", bearer("client_a")).send({ gigId, ...extra })).status, 400);
    }
    const result = await request.post("/api/bookings").set("Authorization", bearer("client_a")).send({ gigId });
    assert.equal(result.status, 201);
    assert.equal(result.body.booking.price, 125.50);
    assert.equal(result.body.transaction.amount, 125.50);
    bookingId = result.body.booking.id;
    assert.equal(await Transaction.countDocuments({ booking: bookingId }), 1);
});

test("only associated users can view a booking and its transaction", async () => {
    for (const name of ["client_a", "freelancer_a"]) {
        const result = await request.get(`/api/bookings/${bookingId}`).set("Authorization", bearer(name));
        assert.equal(result.status, 200);
        assert.equal(result.body.transaction.amount, 125.50);
    }
    for (const name of ["client_b", "freelancer_b"]) {
        assert.equal((await request.get(`/api/bookings/${bookingId}`).set("Authorization", bearer(name))).status, 404);
    }
});

test("booking lists and freelancer income stay scoped to their own records", async () => {
    const own = await request.get("/api/bookings/mine").set("Authorization", bearer("client_a"));
    const other = await request.get("/api/bookings/mine").set("Authorization", bearer("client_b"));
    assert.ok(own.body.bookings.some((booking) => booking.id === bookingId));
    assert.equal(other.body.bookings.length, 0);
    const income = await request.get("/api/income").set("Authorization", bearer("freelancer_a"));
    const strangersIncome = await request.get("/api/income").set("Authorization", bearer("freelancer_b"));
    assert.equal(income.body.totalIncome, 125.50);
    assert.equal(income.body.transactionCount, 1);
    assert.equal(strangersIncome.body.totalIncome, 0);
    assert.equal(strangersIncome.body.recentTransactions.length, 0);
});

test("administrator oversight is explicitly separated from ordinary-user capabilities", async () => {
    for (const name of ["client_a", "freelancer_a"]) {
        assert.equal((await request.get("/api/admin/summary").set("Authorization", bearer(name))).status, 403);
    }
    const result = await request.get("/api/admin/summary").set("Authorization", bearer("admin"));
    assert.equal(result.status, 200);
    assert.equal(result.body.users, 5);
    assert.equal(result.body.transactions, 1);
    assert.equal(result.body.passwordHash, undefined);
});

test("failed transaction creation rolls back its booking", async () => {
    const original = Transaction.create;
    const originalLog = console.error;
    const count = await Booking.countDocuments();
    Transaction.create = async () => { throw new Error("Simulated storage failure."); };
    console.error = () => {};
    try {
        const result = await request.post("/api/bookings").set("Authorization", bearer("client_a")).send({ gigId });
        assert.equal(result.status, 500);
        assert.deepEqual(result.body, { message: "An unexpected error occurred." });
        assert.equal(await Booking.countDocuments(), count);
    } finally {
        Transaction.create = original;
        console.error = originalLog;
    }
});

test("booking limits return 429 per user while another client retains their quota", async () => {
    const missingGig = new mongoose.Types.ObjectId().toString();
    for (let i = 0; i < 20; i += 1) {
        assert.equal((await request.post("/api/bookings").set("Authorization", bearer("client_a")).send({ gigId: missingGig })).status, 404);
    }
    const blocked = await request.post("/api/bookings").set("Authorization", bearer("client_a")).send({ gigId: missingGig });
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.message, /Too many booking attempts/);
    assert.ok(Number(blocked.headers["retry-after"]) > 0);
    assert.ok(blocked.headers.ratelimit);
    assert.equal((await request.post("/api/bookings").set("Authorization", bearer("client_b")).send({ gigId: missingGig })).status, 404);
});

test("login limits return 429 after ten attempts with useful quota and retry headers", async () => {
    for (let i = 0; i < 10; i += 1) {
        assert.equal((await request.post("/api/auth/login").send({ username: "absent_user", password: "WrongDemo1!" })).status, 401);
    }
    const result = await request.post("/api/auth/login").send({ username: "absent_user", password: "WrongDemo1!" });
    assert.equal(result.status, 429);
    assert.ok(Number(result.headers["retry-after"]) > 0);
    assert.ok(result.headers.ratelimit);
    assert.ok(result.headers["ratelimit-policy"]);
});

test("registration is separately rate limited", async () => {
    for (let i = 0; i < 10; i += 1) {
        assert.equal((await request.post("/api/auth/register").send({ username: "invalid_registration" })).status, 400);
    }
    assert.equal((await request.post("/api/auth/register").send({ username: "invalid_registration" })).status, 429);
});

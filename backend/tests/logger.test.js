process.env.LOG_STDOUT = "false";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const logger = require("../utils/logger");
const errorHandler = require("../middleware/errorHandler");

function capture() {
    const events = [];
    const stop = logger.addTransport((record) => events.push(record));
    return { events, stop };
}

test("events are structured JSON records with a timestamp, level, event and outcome", () => {
    const { events, stop } = capture();
    try {
        logger.event("login_failed", { level: "warn", outcome: "denied", reason: "wrong_password" });
        logger.event("booking_created", { bookingId: "abc" });
    } finally { stop(); }

    assert.equal(events.length, 2);
    assert.equal(events[0].event, "login_failed");
    assert.equal(events[0].level, "warn");
    assert.equal(events[0].outcome, "denied");
    assert.equal(events[0].service, "hustlehub-backend");
    assert.ok(!Number.isNaN(Date.parse(events[0].timestamp)));
    assert.equal(events[1].level, "info");
    assert.equal(events[1].outcome, "success", "info events default to a success outcome");
});

test("passwords, tokens and other secrets are redacted, including inside nested objects", () => {
    const { events, stop } = capture();
    try {
        logger.event("probe", {
            password: "hunter2-secret",
            token: "eyJ.fake.jwt",
            authorization: "Bearer eyJ.fake.jwt",
            mongoUri: "mongodb://user:pw@host/db",
            nested: { clientSecret: "nested-secret", harmless: "visible" },
        });
    } finally { stop(); }

    const record = events[0];
    assert.equal(record.password, "[redacted]");
    assert.equal(record.token, "[redacted]");
    assert.equal(record.authorization, "[redacted]");
    assert.equal(record.nested.clientSecret, "[redacted]");
    assert.equal(record.nested.harmless, "visible");
    const text = JSON.stringify(record);
    for (const secret of ["hunter2-secret", "eyJ.fake.jwt", "nested-secret", "user:pw"]) {
        assert.ok(!text.includes(secret), `${secret} must not appear in a log record`);
    }
});

test("errors are logged by name and code only, never by message or stack", () => {
    const { events, stop } = capture();
    try {
        const error = Object.assign(new Error("duplicate key for password=abc123"), { code: 11000 });
        logger.event("probe", { level: "error", error });
    } finally { stop(); }

    assert.deepEqual(events[0].error, { name: "Error", code: 11000 });
    assert.ok(!JSON.stringify(events[0]).includes("abc123"));
});

test("request context adds the correlation id, caller and path without the query string", () => {
    const { events, stop } = capture();
    try {
        logger.event("probe", {
            req: {
                id: "req-12345678", user: { id: "u1", role: "client" }, ip: "::1",
                method: "POST", originalUrl: "/api/auth/login?x=1",
            },
        });
    } finally { stop(); }

    assert.equal(events[0].requestId, "req-12345678");
    assert.equal(events[0].userId, "u1");
    assert.equal(events[0].role, "client");
    assert.equal(events[0].method, "POST");
    assert.equal(events[0].path, "/api/auth/login");
});

test("very long values are truncated", () => {
    const { events, stop } = capture();
    try { logger.event("probe", { note: "x".repeat(5000) }); } finally { stop(); }
    assert.ok(events[0].note.length <= 201);
});

test("a failing log transport never breaks logging or other transports", () => {
    const seen = [];
    const removeBad = logger.addTransport(() => { throw new Error("transport down"); });
    const removeGood = logger.addTransport((record) => seen.push(record));
    try {
        assert.doesNotThrow(() => logger.event("probe", {}));
    } finally { removeBad(); removeGood(); }
    assert.equal(seen.length, 1);
});

test("unexpected errors in the error handler are logged without the error message", () => {
    const { events, stop } = capture();
    const res = {
        headersSent: false,
        status(code) { this.code = code; return this; },
        json(body) { this.body = body; return this; },
    };
    try {
        errorHandler(new Error("db failed for password=abc123"), { id: "req-12345678", method: "GET", originalUrl: "/api/x" }, res, () => {});
    } finally { stop(); }

    assert.equal(res.code, 500);
    assert.deepEqual(res.body, { message: "An unexpected error occurred." });
    assert.equal(events[0].event, "unexpected_error");
    assert.equal(events[0].level, "error");
    assert.equal(events[0].operation, "request");
    assert.ok(!JSON.stringify(events[0]).includes("abc123"));
});

test("the shipper POSTs batches as a JSON array with a bearer token and a _time field", async () => {
    const received = [];
    const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
            received.push({ headers: req.headers, body: JSON.parse(body) });
            res.writeHead(200).end("{}");
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
        const shipper = logger.createShipper({
            url: `http://127.0.0.1:${server.address().port}/v1/ingest/test`,
            token: "test-token", batchSize: 2, flushIntervalMs: 60000, quiet: true,
        });
        shipper.push(logger.buildRecord("login_failed", { level: "warn", outcome: "denied" }));
        shipper.push(logger.buildRecord("login_succeeded", {}));
        await shipper.flush();

        assert.equal(received.length, 1);
        assert.equal(received[0].headers.authorization, "Bearer test-token");
        assert.match(received[0].headers["content-type"], /application\/json/);
        assert.equal(received[0].body.length, 2);
        assert.equal(received[0].body[0].event, "login_failed");
        assert.equal(received[0].body[0]._time, received[0].body[0].timestamp);
        assert.equal(shipper.stats().failures, 0);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});

test("an unreachable log platform is counted as a failure and never throws", async () => {
    const shipper = logger.createShipper({
        url: "http://127.0.0.1:1/unreachable", batchSize: 1, flushIntervalMs: 60000,
        timeoutMs: 1000, quiet: true,
    });
    shipper.push(logger.buildRecord("probe", {}));
    await assert.doesNotReject(() => shipper.flush());
    assert.equal(shipper.stats().failures, 1);
    assert.equal(shipper.stats().buffered, 0);
});

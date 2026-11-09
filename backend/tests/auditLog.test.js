const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { auditLog, writeEvent } = require("../middleware/auditLog");

test("audit records allowlisted fields only and reject unknown events", () => {
    const lines = [];
    writeEvent("login_failed", "untrusted\ninput", 401, 1.6, (line) => lines.push(line));
    writeEvent("secret-password", "", 401, 1, (line) => lines.push(line));
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0]);
    assert.deepEqual(Object.keys(record), ["timestamp", "service", "event", "requestId", "status", "durationMs"]);
    assert.match(record.requestId, /^[a-f0-9-]{36}$/);
    assert.equal(record.durationMs, 2);
    assert.ok(!lines[0].includes("untrusted"));
});

test("audit sink failure cannot break an API request", () => {
    assert.doesNotThrow(() => writeEvent("request_failed", "", 500, 0, () => { throw new Error("offline"); }));
});

test("audit middleware records real response outcomes without request secrets", () => {
    const captured = [];
    const original = console.log;
    console.log = (line) => captured.push(JSON.parse(line));
    try {
        const cases = [
            ["POST", "/api/auth/login", 200, ["login_succeeded"]],
            ["POST", "/api/auth/login", 401, ["login_failed"]],
            ["POST", "/api/auth/login", 429, ["login_limited_or_locked"]],
            ["POST", "/api/auth/logout", 200, ["logout_succeeded"]],
            ["POST", "/api/bookings", 201, ["booking_created", "transaction_created"]],
            ["POST", "/api/bookings", 500, ["request_failed"]],
            ["GET", "/api/protected", 401, ["authentication_rejected"]],
            ["GET", "/api/admin/users", 403, ["access_denied"]],
        ];
        for (const [method, path, status, expected] of cases) {
            captured.length = 0;
            const res = new EventEmitter();
            res.statusCode = status;
            res.set = () => {};
            let nextCalled = false;
            auditLog({ method, path, body: { password: "DO_NOT_LOG" }, headers: { authorization: "SECRET" } }, res, () => { nextCalled = true; });
            assert.equal(nextCalled, true);
            res.emit("finish");
            assert.deepEqual(captured.map((row) => row.event), expected);
            assert.ok(!JSON.stringify(captured).includes("DO_NOT_LOG"));
            assert.ok(!JSON.stringify(captured).includes("SECRET"));
        }
    } finally { console.log = original; }
});

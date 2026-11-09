const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

// Only select structured allowlisted records; never publish raw container logs as evidence.
const { writeEvent } = require("../middleware/auditLog");
const input = fs.readFileSync(process.argv[2], "utf8");
const records = [];
for (const line of input.split(/\r?\n/)) {
    try {
        const record = JSON.parse(line.slice(line.indexOf("{")));
        if (record.service !== "hustlehub-backend") continue;
        if (typeof record.timestamp !== "string" || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(record.timestamp)) continue;
        writeEvent(record.event, record.requestId, record.status, record.durationMs,
            (safe) => records.push({ ...JSON.parse(safe), timestamp: record.timestamp }));
    } catch { /* Ignore ordinary startup messages. */ }
}
for (const event of ["login_succeeded", "login_failed", "booking_created", "transaction_created", "logout_succeeded", "authentication_rejected", "access_denied"]) {
    assert.ok(records.some((record) => record.event === event), `Missing audit event: ${event}`);
}
const destination = path.resolve(__dirname, "../../security/evidence/part3-ci/audit-events.json");
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify({
    capturedAt: new Date().toISOString(), source: "Disposable Docker Compose integration run", records,
    limitation: "CI artifact, not evidence of an external cloud monitoring platform.",
}, null, 2));
console.log(`Verified ${records.length} redacted audit events.`);

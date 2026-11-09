// Structured security and audit logging.
//
// Every event is one JSON object with a timestamp, level, event name and
// outcome. Events go to the console (picked up by Docker / the host) and, when
// LOG_SHIP_URL is set, are also shipped in batches to a cloud log platform over
// HTTPS. Logging must never break a request, so every failure here is swallowed.
//
// Secrets are never logged: sensitive field names are redacted, long strings are
// truncated and errors are reduced to their name and code (messages can contain
// user data).

const SERVICE = "hustlehub-backend";
const MAX_STRING = 200;
const SENSITIVE_KEY = /^(pass(word)?|.*token.*|authorization|.*secret.*|cookie|.*credential.*|.*private.*|.*hash.*|mongo_?uri|.*api_?key)$/i;

function sanitize(value, depth = 0) {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
        return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
    }
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "boolean") return value;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (value instanceof Error) {
        return { name: value.name, ...(value.code !== undefined ? { code: sanitize(value.code, depth + 1) } : {}) };
    }
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
    if (typeof value === "object") {
        if (depth >= 3) return "[object]";
        const out = {};
        for (const [key, inner] of Object.entries(value)) {
            out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitize(inner, depth + 1);
        }
        return out;
    }
    return "[unsupported]";
}

function buildRecord(event, options = {}) {
    const { level = "info", outcome, req, ...fields } = options;
    const record = {
        timestamp: new Date().toISOString(),
        level,
        event,
        outcome: outcome || (level === "info" ? "success" : "failure"),
        service: SERVICE,
        environment: process.env.NODE_ENV || "development",
    };

    if (req) {
        if (req.id) record.requestId = req.id;
        if (req.user) {
            record.userId = req.user.id;
            record.role = req.user.role;
        }
        if (req.ip) record.ip = req.ip;
        if (req.method) record.method = req.method;
        const url = req.originalUrl || req.url;
        if (url) record.path = String(url).split("?")[0].slice(0, MAX_STRING);
    }

    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        record[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitize(value);
    }
    return record;
}

// Buffers events and POSTs them as a JSON array. A failed batch is dropped (the
// console copy remains) so a slow or unreachable platform can never block or
// crash the API.
function createShipper({
    url, token, batchSize = 20, flushIntervalMs = 5000, maxBuffer = 1000,
    timeoutMs = 5000, quiet = false, fetchImpl = globalThis.fetch,
}) {
    const buffer = [];
    let timer = null;
    let flushing = null;
    let failures = 0;

    function schedule() {
        if (timer) return;
        timer = setTimeout(() => { timer = null; flush(); }, flushIntervalMs);
        if (timer.unref) timer.unref();
    }

    function flush() {
        if (timer) { clearTimeout(timer); timer = null; }
        if (flushing) return flushing;
        if (!buffer.length) return Promise.resolve();

        const batch = buffer.splice(0, buffer.length);
        flushing = (async () => {
            try {
                const response = await fetchImpl(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify(batch),
                    signal: AbortSignal.timeout(timeoutMs),
                });
                if (!response.ok) throw new Error("Log platform rejected the batch.");
            } catch {
                failures += 1;
                if (!quiet && (failures === 1 || failures % 50 === 0)) {
                    process.stderr.write("Log shipping failed; events are still written to the console.\n");
                }
            } finally {
                flushing = null;
                if (buffer.length) schedule();
            }
        })();
        return flushing;
    }

    function push(record) {
        buffer.push({ _time: record.timestamp, ...record });
        if (buffer.length > maxBuffer) buffer.splice(0, buffer.length - maxBuffer);
        if (buffer.length >= batchSize) flush(); else schedule();
    }

    return { push, flush, stats: () => ({ buffered: buffer.length, failures }) };
}

const transports = [];
let envShipper;
let envShipperChecked = false;

function getEnvShipper() {
    if (envShipperChecked) return envShipper;
    envShipperChecked = true;
    if (process.env.LOG_SHIP_URL && typeof globalThis.fetch === "function") {
        envShipper = createShipper({ url: process.env.LOG_SHIP_URL, token: process.env.LOG_SHIP_TOKEN });
        process.once("beforeExit", () => { envShipper.flush(); });
    }
    return envShipper;
}

function write(record) {
    if (process.env.LOG_STDOUT !== "false") {
        try { process.stdout.write(`${JSON.stringify(record)}\n`); } catch { /* never break a request */ }
    }
    try { getEnvShipper()?.push(record); } catch { /* ignore */ }
    for (const transport of transports) {
        try { transport(record); } catch { /* ignore */ }
    }
}

function event(name, options) {
    try { write(buildRecord(name, options)); } catch { /* logging must never throw */ }
}

function unexpected(req, operation, error) {
    event("unexpected_error", { level: "error", outcome: "failure", req, operation, error });
}

function addTransport(fn) {
    transports.push(fn);
    return () => {
        const index = transports.indexOf(fn);
        if (index >= 0) transports.splice(index, 1);
    };
}

function flush() {
    return getEnvShipper() ? getEnvShipper().flush() : Promise.resolve();
}

module.exports = { event, unexpected, addTransport, flush, createShipper, sanitize, buildRecord };

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

function find(directory, pattern, depth = 3) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isFile() && pattern.test(entry.name)) return full;
        if (entry.isDirectory() && depth > 0) { const result = find(full, pattern, depth - 1); if (result) return result; }
    }
    return null;
}

module.exports = async function browserZap(root, targetUrl) {
    const key = crypto.randomBytes(24).toString("hex");
    const probe = http.createServer();
    await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    const home = path.join(root, ".private-evidence/zap-frontend-home");
    fs.mkdirSync(home, { recursive: true });
    const java = find(path.join(root, ".local-tools/java17"), /^java\.exe$/);
    const jar = find(path.join(root, ".local-tools/zap"), /^zap-[0-9.]+\.jar$/);
    const child = spawn(java, ["-Xmx512m", "-jar", jar, "-daemon", "-silent", "-host", "127.0.0.1",
        "-port", String(port), "-dir", home, "-config", `api.key=${key}`],
    { cwd: path.dirname(jar), windowsHide: true, stdio: "ignore" });
    const proxyUrl = `http://127.0.0.1:${port}`;
    async function api(component, type, action, parameters = {}) {
        const url = new URL(`${proxyUrl}/JSON/${component}/${type}/${action}/`);
        url.search = new URLSearchParams({ apikey: key, ...parameters });
        const result = await (await fetch(url, { signal: AbortSignal.timeout(3000) })).json();
        if (result.code) throw new Error(`ZAP ${action} failed.`);
        return result;
    }
    const stop = async () => { if (child.exitCode !== null) return; try { await api("core", "action", "shutdown"); } catch { child.kill(); } };
    try {
        let ready = false;
        for (let count = 0; count < 60; count += 1) {
            try { await api("core", "view", "version"); ready = true; break; }
            catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
        }
        if (!ready) throw new Error("Frontend ZAP startup timed out.");
        const regex = `${targetUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/.*`;
        await api("context", "action", "newContext", { contextName: "frontend-security" });
        await api("context", "action", "includeInContext", { contextName: "frontend-security", regex });
        await api("context", "action", "setContextInScope", { contextName: "frontend-security", booleanInScope: "true" });
        await api("core", "action", "setMode", { mode: "protect" });
        await api("pscan", "action", "setScanOnlyInScope", { onlyInScope: "true" });
        return {
            proxy: { server: proxyUrl, bypass: "<-loopback>" }, stop,
            async finish(password) {
                for (let count = 0; count < 30; count += 1) {
                    if (Number((await api("pscan", "view", "recordsToScan")).recordsToScan) === 0) break;
                    await new Promise((resolve) => setTimeout(resolve, 500));
                }
                const alerts = (await api("core", "view", "alerts", { baseurl: targetUrl, start: "0", count: "1000" })).alerts;
                const report = await (await fetch(`${proxyUrl}/OTHER/core/other/htmlreport/?apikey=${key}`)).text();
                if (!report.toLowerCase().includes("<html")) throw new Error("Frontend ZAP report was not HTML.");
                const redact = (text) => text.split(password).join("[REDACTED]").split(key).join("[REDACTED]")
                    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[REDACTED JWT]");
                const directory = path.join(root, "security/evidence");
                fs.writeFileSync(path.join(directory, "zap-frontend.html"), redact(report));
                fs.writeFileSync(path.join(directory, "zap-frontend.json"), redact(JSON.stringify({
                    completedAt: new Date().toISOString(), contextScope: regex,
                    method: "Passive scanning of real Chrome frontend and authenticated API traffic",
                    limitation: "Frontend passive scan supplements separately recorded API active scans; it is not a frontend active scan.",
                    alerts: alerts.map(({ name, risk, confidence, url, solution }) => ({ name, risk, confidence, url, solution })),
                }, null, 2)));
            },
        };
    } catch (error) { await stop(); throw error; }
};

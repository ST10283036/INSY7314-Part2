const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const child = spawn(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=spec", "tests/security.test.js"], {
    cwd: path.join(__dirname, ".."), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
child.stderr.on("data", (chunk) => { process.stderr.write(chunk); });
child.on("error", () => { console.error("The security test process could not start."); process.exitCode = 1; });
child.on("close", (code) => {
    const count = (label) => Number(output.match(new RegExp(`(?:ℹ|i) ${label} (\\d+)`))?.[1] || 0);
    const evidenceDir = path.join(__dirname, "../../security/evidence");
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, "node-test-results.json"), JSON.stringify({
        completedAt: new Date().toISOString(), tool: "Node.js test runner",
        database: "Isolated real MongoDB", exitCode: code,
        tests: count("tests"), passed: count("pass"), failed: count("fail"),
        skipped: count("skipped"),
        cases: output.split(/\r?\n/).filter((line) => line.startsWith("✔ "))
            .map((line) => line.replace(/^✔ /, "").replace(/ \([\d.]+ms\)$/, "")),
    }, null, 2));
    process.exitCode = code || 0;
});

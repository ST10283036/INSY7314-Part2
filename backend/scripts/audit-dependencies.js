const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this script using npm run security:audit.");

function audit(productionOnly) {
    const result = spawnSync(process.execPath, [npmCli, "audit", "--json",
        ...(productionOnly ? ["--omit=dev"] : []), "--fetch-retries=0", "--fetch-timeout=20000"], {
        cwd: path.join(__dirname, ".."), windowsHide: true, encoding: "utf8",
    });
    const report = JSON.parse(result.stdout || "{}");
    if (!report.metadata || report.error) throw new Error("The advisory service could not be reached.");
    return {
        counts: report.metadata.vulnerabilities,
        advisories: Object.values(report.vulnerabilities).map((entry) => ({
            package: entry.name, severity: entry.severity,
            references: entry.via.filter((item) => typeof item === "object").map((item) => item.url),
        })),
    };
}

try {
    const production = audit(true);
    const includingDevelopmentTools = audit(false);
    const report = {
        completedAt: new Date().toISOString(), production, includingDevelopmentTools,
        note: "Development-tool advisories must be reviewed separately; do not run untrusted Postman collections. No forced dependency downgrade was applied.",
    };
    const directory = path.join(__dirname, "../../security/evidence");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "dependency-audit.json"), JSON.stringify(report, null, 2));
    console.log(`Production advisories: ${production.counts.total}. Including development tools: ${includingDevelopmentTools.counts.total}.`);
    if (production.counts.total) process.exitCode = 1;
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}

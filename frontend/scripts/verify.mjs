import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hustlehub-frontend-checks-"));
const reportPath = path.join(frontend, "../security/evidence/part3-frontend-checks.json");
const report = { completedAt: null, tools: {}, success: false };
let failed = false;

function run(name, script, args) {
  console.log(`Checking ${name}...`);
  const result = spawnSync(process.execPath, [path.join(frontend, script), ...args], {
    cwd: frontend, encoding: "utf8", windowsHide: true,
  });
  if (result.status !== 0) {
    failed = true;
    console.error(result.stderr || result.stdout || `${name} could not start.`);
  }
  return result.status ?? 1;
}

try {
  const lintFile = path.join(temporary, "lint.json");
  const lintExit = run("ESLint", "node_modules/eslint/bin/eslint.js",
    [".", "--max-warnings=0", "--format=json", `--output-file=${lintFile}`]);
  const lint = fs.existsSync(lintFile) ? JSON.parse(fs.readFileSync(lintFile, "utf8")) : [];
  report.tools.eslint = { exitCode: lintExit, files: lint.length,
    errors: lint.reduce((sum, file) => sum + file.errorCount, 0),
    warnings: lint.reduce((sum, file) => sum + file.warningCount, 0) };

  const testFile = path.join(temporary, "tests.json");
  const testExit = run("Vitest", "node_modules/vitest/vitest.mjs",
    ["run", "--reporter=json", `--outputFile=${testFile}`]);
  const tests = fs.existsSync(testFile) ? JSON.parse(fs.readFileSync(testFile, "utf8")) : {};
  report.tools.vitest = { exitCode: testExit, total: tests.numTotalTests ?? 0,
    passed: tests.numPassedTests ?? 0, failed: tests.numFailedTests ?? 0,
    skipped: tests.numPendingTests ?? 0,
    cases: (tests.testResults ?? []).flatMap((suite) => (suite.assertionResults ?? []).map((test) => ({
      name: test.fullName, status: test.status,
    }))) };
  report.tools.build = { exitCode: run("Vite production build", "node_modules/vite/bin/vite.js", ["build"]) };
  report.success = !failed;
} finally {
  report.completedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  // Only the unique temporary directory created by this invocation is removed.
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(`Frontend verification ${report.success ? "passed" : "failed"}. See security/evidence/part3-frontend-checks.json.`);
process.exitCode = report.success ? 0 : 1;

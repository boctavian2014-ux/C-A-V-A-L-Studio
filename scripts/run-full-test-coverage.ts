#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { formatCoverageReport, scanProjectCoverage } from "../tests/engine/coverage-scanner";

const root = path.resolve(__dirname, "..");
const reportDir = path.join(root, "coverage", "engine");

console.log("[FTCE] Full Test Coverage Engine — running vitest with coverage...\n");

try {
  execSync("npm run test:coverage", { cwd: root, stdio: "inherit" });
} catch {
  console.warn("[FTCE] Some tests failed — see output above.");
}

const scan = scanProjectCoverage(root);
const report = formatCoverageReport(scan);

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, "scan-result.json"), JSON.stringify(scan, null, 2), "utf8");
fs.writeFileSync(path.join(reportDir, "report.md"), report, "utf8");

console.log("\n" + report);
console.log(`\n[FTCE] Report saved to ${reportDir}/report.md`);

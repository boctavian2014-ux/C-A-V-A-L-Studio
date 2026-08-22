#!/usr/bin/env node
/**
 * Daily C2 CAD observation: Railway deploy stdout only.
 * Persists the aggregated report — never raw log lines — under
 * artifacts/c2-observation/ (gitignored). Keep Railway Logs for RCA.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const service = process.env.RAILWAY_CAD_SERVICE;
const environment = process.env.RAILWAY_ENVIRONMENT ?? "production";
const since = process.env.C2_SINCE ?? "24h";
const lines = process.env.C2_LOG_LINES ?? "5000";

if (!service) {
  throw new Error("Missing RAILWAY_CAD_SERVICE");
}

const stdout = execFileSync(
  "railway",
  [
    "logs",
    "--service",
    service,
    "--environment",
    environment,
    "--since",
    since,
    "--lines",
    lines,
    "--json",
  ],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

const rows = stdout
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { raw: line };
    }
  });

// Search the unescaped `message` (Railway JSON envelope) so nested
// `"requestClass":"legacy"` is not missed after JSON.stringify escaping.
const textOf = (row) => {
  if (typeof row === "string") return row;
  const parts = [];
  if (typeof row?.raw === "string") parts.push(row.raw);
  if (typeof row?.message === "string") parts.push(row.message);
  parts.push(JSON.stringify(row));
  return parts.join("\n");
};

const secretPatterns = [
  /sk-or-v1-/i,
  /openRouterApiKey/i,
  /meshApiKey/i,
  /piapiApiKey/i,
  /ghp_/i,
  /Bearer eyJ/i,
];

const secretHits = rows.filter((row) =>
  secretPatterns.some((pattern) => pattern.test(textOf(row))),
);

const cadRows = rows.filter((row) => textOf(row).includes("[cad]"));
const cadText = cadRows.map(textOf);
const legacyRequests = cadText.filter((x) =>
  x.includes('"requestClass":"legacy"'),
).length;
const profileRequests = cadText.filter((x) =>
  x.includes('"requestClass":"profile"'),
).length;
const requests = cadText.filter((x) =>
  x.includes('"event":"cad_request"'),
).length;
const completed = cadText.filter((x) =>
  x.includes('"event":"job_completed"'),
).length;
const failed = cadText.filter((x) =>
  x.includes('"event":"job_failed"'),
).length;

const deploymentIds = [
  ...new Set(
    rows
      .map((row) => row?.deploymentId ?? row?.deployment_id)
      .filter((id) => typeof id === "string" && id.length > 0),
  ),
];

const report = {
  checkedAt: new Date().toISOString(),
  service,
  environment,
  since,
  deploymentIds,
  totalLogRows: rows.length,
  cadLogRows: cadRows.length,
  requestClass: {
    legacy: legacyRequests,
    profile: profileRequests,
  },
  events: {
    cad_request: requests,
    job_completed: completed,
    job_failed: failed,
  },
  secretPatternHits: secretHits.length,
  status: secretHits.length > 0 ? "INCIDENT" : "OK",
};

console.log(JSON.stringify(report, null, 2));
mkdirSync("artifacts/c2-observation", { recursive: true });
writeFileSync(
  path.join("artifacts/c2-observation", `${report.checkedAt.slice(0, 10)}.json`),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (secretHits.length > 0) {
  console.error(
    `C2 INCIDENT: ${secretHits.length} secret-pattern hit(s). ` +
      "Stop the observation window, start RCA, and do not begin PR2.",
  );
  process.exit(2);
}

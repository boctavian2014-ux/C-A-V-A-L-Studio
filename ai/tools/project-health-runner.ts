import fs from "node:fs";
import path from "node:path";

import {
  applyHealthRunResult,
  detectProjectHealthChecks,
  PROJECT_HEALTH_CHECK_DEFINITIONS,
  type ProjectHealthCheckItem,
} from "../../src/shared/project-health-check";
import { redactSensitiveCommandOutput } from "../../src/shared/command-output-redaction";
import { normalizeWorkspaceRoot } from "../../src/main/path-security";
import { runAllowedWorkspaceCommand } from "./workspace-command-runner";
import { workspaceCommandMutex } from "./workspace-execute-lock";

export interface ProjectHealthSnapshot {
  packageFound: boolean;
  packageName?: string;
  checks: ProjectHealthCheckItem[];
}

const RUN_TIMEOUT_MS: Record<string, number> = {
  typecheck: 120_000,
  lint: 180_000,
  test: 180_000,
  build: 600_000,
};

/** @internal test helper — reuses shared Zone B mutex */
export function isProjectHealthExecuteInFlight(workspaceRoot: string): boolean {
  return workspaceCommandMutex.isInFlight(workspaceRoot);
}

/** @internal test helper */
export function clearProjectHealthExecuteLocks(): void {
  workspaceCommandMutex.clear();
}

function resolveTrustedWorkspaceRoot(workspaceRoot: string): string {
  const root = normalizeWorkspaceRoot(workspaceRoot);
  if (!fs.existsSync(root)) {
    throw new Error("Workspace path not found");
  }
  return root;
}

function readWorkspaceScripts(workspaceRoot: string): {
  packageFound: boolean;
  packageName?: string;
  scripts: Record<string, string> | null;
} {
  const root = resolveTrustedWorkspaceRoot(workspaceRoot);
  const pkgPath = path.join(root, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return { packageFound: false, scripts: null };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      name?: string;
      scripts?: Record<string, string>;
    };
    return {
      packageFound: true,
      packageName: parsed.name,
      scripts: parsed.scripts ?? {},
    };
  } catch {
    return { packageFound: true, scripts: null };
  }
}

function isTimedOutRun(exitCode: number | null, output: string, timedOut?: boolean): boolean {
  return Boolean(timedOut) || (exitCode === null && /timed out after \d+ms/i.test(output));
}

async function runScan(workspaceRoot: string): Promise<ProjectHealthSnapshot> {
  const { packageFound, packageName, scripts } = readWorkspaceScripts(workspaceRoot);
  return {
    packageFound,
    packageName,
    checks: detectProjectHealthChecks(scripts),
  };
}

async function runExecute(workspaceRoot: string): Promise<ProjectHealthSnapshot> {
  const { packageFound, packageName, scripts } = readWorkspaceScripts(workspaceRoot);
  const checks = detectProjectHealthChecks(scripts);
  const executed: ProjectHealthCheckItem[] = [];

  for (const check of checks) {
    if (check.status === "missing") {
      executed.push({ ...check, status: "skipped" });
      continue;
    }

    const def = PROJECT_HEALTH_CHECK_DEFINITIONS.find((d) => d.id === check.id);
    if (!def) {
      executed.push({ ...check, status: "failed", output: "Unknown check id" });
      continue;
    }

    const timeout = RUN_TIMEOUT_MS[check.id] ?? 120_000;
    const run = await runAllowedWorkspaceCommand(def.npmCommand, workspaceRoot, timeout);
    const timedOut = isTimedOutRun(run.exitCode, run.output, run.timedOut);
    executed.push(
      applyHealthRunResult(check, {
        ok: run.ok && !timedOut,
        exitCode: run.exitCode,
        output: redactSensitiveCommandOutput(run.output),
        timedOut,
      })
    );
  }

  return { packageFound, packageName, checks: executed };
}

/** Inspect package.json scripts; optionally execute canonical npm checks only. */
export async function runProjectHealthSnapshot(
  workspaceRoot: string,
  options: { execute?: boolean } = {}
): Promise<ProjectHealthSnapshot> {
  if (!options.execute) {
    return runScan(workspaceRoot);
  }

  return workspaceCommandMutex.runExclusive(workspaceRoot, () => runExecute(workspaceRoot));
}

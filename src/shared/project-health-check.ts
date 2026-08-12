export type ProjectHealthCheckId = "typecheck" | "lint" | "test" | "build";

/** Scan: missing | available. Execute: running | passed | failed | skipped | timed_out. */
export type ProjectHealthStatus =
  | "missing"
  | "available"
  | "running"
  | "passed"
  | "failed"
  | "skipped"
  | "timed_out";

export type ProjectHealthAction = "scan" | "execute";

export interface ProjectHealthCheckDefinition {
  id: ProjectHealthCheckId;
  scriptKey: string;
  npmCommand: string;
  label: string;
}

/** Canonical npm script keys inspected for project health. */
export const PROJECT_HEALTH_CHECK_DEFINITIONS: readonly ProjectHealthCheckDefinition[] = [
  { id: "typecheck", scriptKey: "typecheck", npmCommand: "npm run typecheck", label: "Typecheck" },
  { id: "lint", scriptKey: "lint", npmCommand: "npm run lint", label: "Lint" },
  { id: "test", scriptKey: "test", npmCommand: "npm test", label: "Test" },
  { id: "build", scriptKey: "build", npmCommand: "npm run build", label: "Build" },
] as const;

export const PROJECT_HEALTH_CHECK_IDS = new Set<ProjectHealthCheckId>(
  PROJECT_HEALTH_CHECK_DEFINITIONS.map((d) => d.id)
);

export interface ProjectHealthCheckItem extends ProjectHealthCheckDefinition {
  status: ProjectHealthStatus;
  script?: string;
  exitCode?: number | null;
  output?: string;
}

export interface ProjectHealthRunResult {
  ok: boolean;
  exitCode: number | null;
  output: string;
  timedOut?: boolean;
}

/** True when package.json defines a non-empty script for the key. */
export function scriptExists(
  scripts: Record<string, string> | undefined | null,
  scriptKey: string
): boolean {
  const value = scripts?.[scriptKey];
  return typeof value === "string" && value.trim().length > 0;
}

/** Detect Available vs Missing from package.json scripts (scan only, no execution). */
export function detectProjectHealthChecks(
  scripts: Record<string, string> | undefined | null
): ProjectHealthCheckItem[] {
  return PROJECT_HEALTH_CHECK_DEFINITIONS.map((def) => {
    const exists = scriptExists(scripts, def.scriptKey);
    return {
      ...def,
      status: exists ? "available" : "missing",
      script: exists ? scripts![def.scriptKey].trim() : undefined,
    };
  });
}

/** Map execution outcome onto an existing check item. */
export function applyHealthRunResult(
  item: ProjectHealthCheckItem,
  run: ProjectHealthRunResult
): ProjectHealthCheckItem {
  if (item.status === "missing") {
    return { ...item, status: "skipped" };
  }
  if (run.timedOut) {
    return {
      ...item,
      status: "timed_out",
      exitCode: run.exitCode,
      output: run.output,
    };
  }
  return {
    ...item,
    status: run.ok ? "passed" : "failed",
    exitCode: run.exitCode,
    output: run.output,
  };
}

/** Parse scripts from raw package.json text; returns null on invalid JSON. */
export function parsePackageScripts(raw: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
    if (!parsed || typeof parsed !== "object") return null;
    return parsed.scripts ?? {};
  } catch {
    return null;
  }
}

export function parseProjectHealthAction(input: unknown): ProjectHealthAction | null {
  return input === "scan" || input === "execute" ? input : null;
}

/**
 * UI-only safety timeout while waiting for main IPC on execute.
 * Slightly above the sum of per-script runner timeouts (typecheck+lint+test+build).
 * Does not cancel the main job — only clears stuck renderer "running" state.
 */
export const PROJECT_HEALTH_UI_SAFETY_TIMEOUT_MS = 20 * 60 * 1000;

export function healthStatusLabel(status: ProjectHealthStatus): string {
  switch (status) {
    case "available":
      return "Available";
    case "missing":
      return "Missing";
    case "running":
      return "Running";
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    case "timed_out":
      return "Timed out";
  }
}

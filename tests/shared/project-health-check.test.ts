import { describe, expect, it } from "vitest";

import {
  applyHealthRunResult,
  detectProjectHealthChecks,
  healthStatusLabel,
  parsePackageScripts,
  parseProjectHealthAction,
  PROJECT_HEALTH_CHECK_DEFINITIONS,
  scriptExists,
} from "../../src/shared/project-health-check";

describe("project-health-check", () => {
  it("detects all four canonical checks", () => {
    expect(PROJECT_HEALTH_CHECK_DEFINITIONS.map((d) => d.id)).toEqual([
      "typecheck",
      "lint",
      "test",
      "build",
    ]);
  });

  it("scriptExists returns false for empty or missing scripts", () => {
    expect(scriptExists(undefined, "lint")).toBe(false);
    expect(scriptExists({}, "lint")).toBe(false);
    expect(scriptExists({ lint: "   " }, "lint")).toBe(false);
  });

  it("scriptExists returns true for non-empty script values", () => {
    expect(scriptExists({ typecheck: "tsc --noEmit" }, "typecheck")).toBe(true);
  });

  it("detectProjectHealthChecks marks present scripts as available and absent as missing", () => {
    const checks = detectProjectHealthChecks({
      typecheck: "tsc --noEmit",
      test: "vitest run",
    });
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    expect(byId.typecheck.status).toBe("available");
    expect(byId.typecheck.script).toBe("tsc --noEmit");
    expect(byId.lint.status).toBe("missing");
    expect(byId.test.status).toBe("available");
    expect(byId.build.status).toBe("missing");
  });

  it("detectProjectHealthChecks handles null scripts as all missing", () => {
    const checks = detectProjectHealthChecks(null);
    expect(checks.every((c) => c.status === "missing")).toBe(true);
  });

  it("applyHealthRunResult sets failed on non-zero exit", () => {
    const base = detectProjectHealthChecks({ lint: "eslint ." })[1];
    const updated = applyHealthRunResult(base, {
      ok: false,
      exitCode: 1,
      output: "lint errors",
    });
    expect(updated.status).toBe("failed");
    expect(updated.exitCode).toBe(1);
    expect(updated.output).toBe("lint errors");
  });

  it("applyHealthRunResult sets passed on success", () => {
    const base = detectProjectHealthChecks({ lint: "eslint ." })[1];
    const updated = applyHealthRunResult(base, { ok: true, exitCode: 0, output: "ok" });
    expect(updated.status).toBe("passed");
  });

  it("applyHealthRunResult sets timed_out when flagged", () => {
    const base = detectProjectHealthChecks({ test: "vitest run" })[2];
    const updated = applyHealthRunResult(base, {
      ok: false,
      exitCode: null,
      output: "(timed out after 120000ms)",
      timedOut: true,
    });
    expect(updated.status).toBe("timed_out");
  });

  it("applyHealthRunResult skips missing checks on execute", () => {
    const missing = detectProjectHealthChecks({})[0];
    const updated = applyHealthRunResult(missing, { ok: false, exitCode: 1, output: "x" });
    expect(updated.status).toBe("skipped");
  });

  it("parsePackageScripts extracts scripts object", () => {
    expect(parsePackageScripts('{"scripts":{"build":"webpack"}}')).toEqual({ build: "webpack" });
    expect(parsePackageScripts("{ invalid")).toBeNull();
  });

  it("parseProjectHealthAction accepts only scan and execute", () => {
    expect(parseProjectHealthAction("scan")).toBe("scan");
    expect(parseProjectHealthAction("execute")).toBe("execute");
    expect(parseProjectHealthAction("build")).toBeNull();
    expect(parseProjectHealthAction({ execute: true })).toBeNull();
  });

  it("healthStatusLabel maps statuses for UI", () => {
    expect(healthStatusLabel("available")).toBe("Available");
    expect(healthStatusLabel("missing")).toBe("Missing");
    expect(healthStatusLabel("passed")).toBe("Passed");
    expect(healthStatusLabel("failed")).toBe("Failed");
    expect(healthStatusLabel("skipped")).toBe("Skipped");
    expect(healthStatusLabel("timed_out")).toBe("Timed out");
  });

  it("exports UI safety timeout separate from runner timeouts", async () => {
    const { PROJECT_HEALTH_UI_SAFETY_TIMEOUT_MS } = await import(
      "../../src/shared/project-health-check"
    );
    expect(PROJECT_HEALTH_UI_SAFETY_TIMEOUT_MS).toBeGreaterThan(15 * 60 * 1000);
  });
});

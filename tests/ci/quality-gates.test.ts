import { describe, expect, it } from "vitest";
import { PR_QUALITY_GATES, RELEASE_ONLY_GATES } from "../../.cicd/scripts/quality-gates";
import {
  buildElectronSmokeEnv,
  ELECTRON_SMOKE_WARNING_ALLOWLIST,
  isAllowedSmokeWarning,
  isFatalSmokeLine,
  listForbiddenSmokeKeys,
} from "../../scripts/electron-smoke-env";

describe("Q1 quality gates", () => {
  it("PR gates run typecheck → lint → test → build → verify-runtime-assets", () => {
    expect(PR_QUALITY_GATES.map((g) => g[1].join(" "))).toEqual([
      "run typecheck",
      "run lint",
      "test",
      "run build",
      "run verify-runtime-assets",
    ]);
  });

  it("release-only gate is Electron smoke", () => {
    expect(RELEASE_ONLY_GATES).toEqual([["npm", ["run", "smoke:electron"]]]);
  });
});

describe("Q1-F Electron smoke env", () => {
  it("rejects leftover provider keys in the smoke environment", () => {
    const dirty = {
      PATH: "/usr/bin",
      OPENROUTER_API_KEY: "sk-or-secret",
      CAD_API_KEY: "cad",
      CAVAL_CLOUD_AI_URL: "https://example.invalid",
    };
    expect(listForbiddenSmokeKeys(dirty)).toEqual(
      expect.arrayContaining(["OPENROUTER_API_KEY", "CAD_API_KEY", "CAVAL_CLOUD_AI_URL"])
    );
    const smoke = buildElectronSmokeEnv(dirty);
    expect(listForbiddenSmokeKeys(smoke)).toEqual([]);
    expect(smoke.CAVAL_SMOKE).toBe("1");
    expect(smoke.OPENROUTER_API_KEY).toBeUndefined();
    expect(smoke.CAD_API_URL).toBeUndefined();
  });

  it("does not treat React DevTools as fatal", () => {
    const line =
      "Download the React DevTools for a better development experience: https://react.dev/link/react-devtools";
    expect(isAllowedSmokeWarning(line)).toBe(true);
    expect(isFatalSmokeLine(line)).toBe(false);
    expect(ELECTRON_SMOKE_WARNING_ALLOWLIST.length).toBeGreaterThan(0);
  });

  it("treats missing worker modules as fatal", () => {
    expect(isFatalSmokeLine("Cannot find module 'dist/main/parallel-worker.js'")).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAD_JOB_LOG_PREFIX,
  cadProviderFromCadMode,
  inferCadActualProvider,
  logCadJob,
  resolveCadBadgeCost,
  resolveCadBadgeProvider,
} from "../../src/shared/cad-job-lineage";
import { suggestCadProviderFromPrompt } from "../../src/shared/cad-zoo-contract";

describe("cad job provider lineage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps generationMode / pipeline to badge providers", () => {
    expect(cadProviderFromCadMode("zoo")).toBe("zoo");
    expect(cadProviderFromCadMode("mesh")).toBe("trellis");
    expect(cadProviderFromCadMode("openscad")).toBe("openscad");
    expect(cadProviderFromCadMode("library")).toBe("openscad");
  });

  it("treats empty prompt suggestion as OpenSCAD (the RC #4 stale default)", () => {
    expect(suggestCadProviderFromPrompt("")).toBe("openscad");
    expect(suggestCadProviderFromPrompt("piuliță M3")).toBe("zoo");
  });

  it("binds the badge to actual/resolved job provider, not the prompt guess", () => {
    expect(
      resolveCadBadgeProvider({
        suggestedProvider: "openscad",
        resolvedProvider: "zoo",
        actualProvider: "zoo",
      })
    ).toBe("zoo");
    expect(
      resolveCadBadgeProvider({
        suggestedProvider: "zoo",
        resolvedProvider: "zoo",
        actualProvider: "openscad",
      })
    ).toBe("openscad");
  });

  it("infers zoo→openscad silent fallback from SCAD artifact or log line", () => {
    expect(
      inferCadActualProvider({
        resolvedProvider: "zoo",
        hasScad: true,
        hasStl: true,
      })
    ).toBe("openscad");
    expect(
      inferCadActualProvider({
        resolvedProvider: "zoo",
        hasScad: false,
        hasStl: true,
        fallbackMessage: "zoo failed → openscad: timeout",
      })
    ).toBe("openscad");
    expect(
      inferCadActualProvider({
        resolvedProvider: "zoo",
        hasScad: false,
        hasStl: true,
      })
    ).toBe("zoo");
  });

  it("keeps Zoo cost on the badge when the job actually ran Zoo", () => {
    const cost = resolveCadBadgeCost({
      provider: "zoo",
      jobCost: null,
      prompt: "piuliță",
    });
    expect(cost?.provider).toBe("zoo");
    expect(cost?.estimatedCostUsd).toBeGreaterThan(0);
    expect(cost?.estimatedCostUsd).toBeCloseTo(0.04, 2);
  });

  it("emits JSON cad_job_start / cad_job_done lines", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logCadJob("cad_job_start", { requestedProvider: "zoo", resolvedProvider: "zoo" });
    logCadJob("cad_job_done", { actualProvider: "zoo", cost: 0.04 });
    expect(spy.mock.calls[0]?.[0]).toBe(
      `${CAD_JOB_LOG_PREFIX} ${JSON.stringify({
        event: "cad_job_start",
        requestedProvider: "zoo",
        resolvedProvider: "zoo",
      })}`
    );
    expect(spy.mock.calls[1]?.[0]).toBe(
      `${CAD_JOB_LOG_PREFIX} ${JSON.stringify({
        event: "cad_job_done",
        actualProvider: "zoo",
        cost: 0.04,
      })}`
    );
  });
});

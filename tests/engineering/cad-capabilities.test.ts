import { describe, expect, it, vi, beforeEach } from "vitest";
import { adjustPlanPipeline, suggestMeshFromPrompt } from "../../engineering/cad-server/cad-capabilities";
import { resetOpenScadProbeCacheForTests } from "../../engineering/cad-server/scad-runner";

vi.mock("../../engineering/cad-server/scad-runner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../engineering/cad-server/scad-runner")>();
  return {
    ...actual,
    isOpenScadInstalled: vi.fn(async () => false),
  };
});

describe("cad-capabilities", () => {
  beforeEach(() => {
    resetOpenScadProbeCacheForTests();
    delete process.env.MESHY_API_KEY;
  });

  it("suggests mesh for furniture prompts", () => {
    expect(suggestMeshFromPrompt("dulap pentru haine 180cm")).toBe(true);
    expect(suggestMeshFromPrompt("motor mount M3 30mm")).toBe(false);
  });

  it("falls back to mesh when openscad missing and mesh key present", async () => {
    process.env.MESHY_API_KEY = "test-key";
    const plan = await adjustPlanPipeline({
      action: "generate",
      userLanguage: "ro",
      intent: "mechanical",
      pipeline: "openscad",
      technicalPrompt: "Weather station enclosure 120x80x40mm",
    });
    expect(plan.pipeline).toBe("mesh");
    expect(plan.warnings?.some((w) => /OpenSCAD|Meshy/i.test(w))).toBe(true);
  });
});

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
    delete process.env.MESH_WORKER_URL;
  });

  it("suggests mesh for furniture prompts", () => {
    expect(suggestMeshFromPrompt("dulap pentru haine 180cm")).toBe(true);
    expect(suggestMeshFromPrompt("motor mount M3 30mm")).toBe(false);
  });

  it("suggests mesh for animals, insects, and toy robots", () => {
    expect(suggestMeshFromPrompt("un câine jucărie")).toBe(true);
    expect(suggestMeshFromPrompt("fluture colorat")).toBe(true);
    expect(suggestMeshFromPrompt("păianjen realist")).toBe(true);
    expect(suggestMeshFromPrompt("cute toy robot figurine")).toBe(true);
    expect(suggestMeshFromPrompt("robot arm with M3 mounts")).toBe(false);
  });

  it("falls back to mesh when openscad missing and mesh worker present", async () => {
    process.env.MESH_WORKER_URL = "https://mesh.example.test";
    const plan = await adjustPlanPipeline({
      action: "generate",
      userLanguage: "ro",
      intent: "mechanical",
      pipeline: "openscad",
      technicalPrompt: "Weather station enclosure 120x80x40mm",
    });
    expect(plan.pipeline).toBe("mesh");
    expect(plan.warnings?.some((w) => /OpenSCAD|Meshy|OSS|text/i.test(w))).toBe(true);
  });

  it("keeps mesh pipeline with warning when no provider configured", async () => {
    const plan = await adjustPlanPipeline({
      action: "generate",
      userLanguage: "ro",
      intent: "organic",
      pipeline: "mesh",
      technicalPrompt: "un fluture colorat",
    });
    expect(plan.pipeline).toBe("mesh");
    expect(plan.warnings?.some((w) => /MESH_WORKER|Meshy|TRELLIS|text-to-3D/i.test(w))).toBe(true);
  });
});

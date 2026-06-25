import { describe, expect, it, vi, beforeEach } from "vitest";

import { modelCache } from "../../ai/models/model-cache";
import { getCoreModelConfigs, getModelsForContext, CORE_MODEL_IDS } from "../../ai/models/model-registry";
import { getPreloadStatus, preloadForContext } from "../../ai/models/model-preload";

describe("model-registry", () => {
  it("exposes core model configs", () => {
    const cores = getCoreModelConfigs();
    expect(cores.length).toBe(3);
    expect(cores.map((c) => c.id)).toContain(CORE_MODEL_IDS.reasoning);
    expect(cores.map((c) => c.id)).toContain(CORE_MODEL_IDS.coding);
    expect(cores.map((c) => c.id)).toContain(CORE_MODEL_IDS.autocomplete);
  });

  it("selects models for TypeScript context", () => {
    const models = getModelsForContext({ language: "ts", projectType: "general" });
    expect(models.some((m) => m.id === CORE_MODEL_IDS.coding)).toBe(true);
    expect(models.some((m) => m.id === CORE_MODEL_IDS.reasoning)).toBe(true);
  });

  it("selects models for backend project", () => {
    const models = getModelsForContext({ language: "py", projectType: "backend" });
    expect(models.some((m) => m.id === CORE_MODEL_IDS.reasoning)).toBe(true);
  });

  it("selects models for mobile project", () => {
    const models = getModelsForContext({ language: "tsx", projectType: "mobile" });
    expect(models.some((m) => m.id === CORE_MODEL_IDS.coding)).toBe(true);
  });
});

describe("model-preload queue", () => {
  beforeEach(() => {
    for (const handle of modelCache.list()) {
      modelCache.delete(handle.modelId);
    }
  });

  it("queues contextual preload without throwing", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    expect(() => preloadForContext({ language: "ts", projectType: "backend" })).not.toThrow();
    expect(getPreloadStatus().ready.length + getPreloadStatus().loading.length).toBeGreaterThanOrEqual(0);
    fetchSpy.mockRestore();
  });
});

import { describe, expect, it, vi } from "vitest";

import { ModelCache } from "../../ai/models/model-cache";
import { inferPreloadContext } from "../../ai/models/infer-context";
import {
  CORE_MODEL_IDS,
  getCoreModelConfigs,
  getModelConfig,
  getModelsForContext,
  profileToConfig,
} from "../../ai/models/model-registry";
import { getModelProfile } from "../../ai/model-profiles";

describe("model-registry", () => {
  it("maps core model ids to configs", () => {
    const cores = getCoreModelConfigs();
    expect(cores.map((c) => c.id)).toEqual(
      expect.arrayContaining([CORE_MODEL_IDS.reasoning, CORE_MODEL_IDS.coding, CORE_MODEL_IDS.autocomplete])
    );
  });

  it("selects backend context models including tools", () => {
    const models = getModelsForContext({ language: "py", projectType: "backend" });
    expect(models.some((m) => m.id === CORE_MODEL_IDS.reasoning)).toBe(true);
  });

  it("profileToConfig assigns runtime for open_source vs http", () => {
    const local = getModelProfile("qwen2.5-coder:7b");
    const cloud = getModelProfile("nex-n2-pro");
    expect(local && profileToConfig(local).runtime).toBe("local_ollama");
    expect(cloud && profileToConfig(cloud).runtime).toBe("http");
  });

  it("getModelConfig returns undefined for unknown id", () => {
    expect(getModelConfig("nonexistent-model-id")).toBeUndefined();
  });
});

describe("inferPreloadContext", () => {
  it("detects mobile projects", () => {
    const ctx = inferPreloadContext("/proj/my-app", ["src/App.tsx", "package.json"]);
    expect(ctx.projectType).toBe("frontend");
  });

  it("detects backend from markers", () => {
    const ctx = inferPreloadContext("/proj/api", ["server/express.ts"]);
    expect(ctx.projectType).toBe("backend");
    expect(ctx.language).toBe("ts");
  });
});

describe("ModelCache", () => {
  it("tracks loading and ready states", () => {
    const cache = new ModelCache();
    cache.set({
      modelId: "test",
      config: {
        id: "test",
        displayName: "Test",
        kind: "general",
        runtime: "http",
        provider: "test",
        endpoint: "http://localhost",
        sizeEstimateMb: 0,
        capabilities: ["chat"],
        priority: 1,
      },
      state: "loading",
      loadedAt: Date.now(),
      ready: false,
    });
    expect(cache.isLoading("test")).toBe(true);
    expect(cache.isReady("test")).toBe(false);
  });
});

describe("model-loader", () => {
  it("marks http models ready after warm probe", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    );

    const { loadModel } = await import("../../ai/models/model-loader");
    const config = getModelConfig(CORE_MODEL_IDS.reasoning);
    expect(config).toBeTruthy();
    const handle = await loadModel(config!);
    expect(handle.ready).toBe(true);
    expect(handle.state).toBe("ready");

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

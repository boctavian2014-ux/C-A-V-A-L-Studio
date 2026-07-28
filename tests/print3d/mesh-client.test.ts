import { afterEach, describe, expect, it, vi } from "vitest";

describe("mesh-client provider routing", () => {
  afterEach(() => {
    delete process.env.MESHY_API_KEY;
    delete process.env.PIAPI_API_KEY;
    delete process.env.TRELLIS_API_KEY;
    delete process.env.MESH_WORKER_URL;
    delete process.env.MESH_WORKER_TOKEN;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("requires a provider when none configured", async () => {
    const { generateMeshFromPrompt } = await import("../../engineering/cad-server/mesh-client");
    const result = await generateMeshFromPrompt({ prompt: "cartoon mouse" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/PIAPI_API_KEY|MESHY_API_KEY|MESH_WORKER|No text-to-3D/i);
  });

  it("uses PiAPI Trellis first when PIAPI_API_KEY is set", async () => {
    process.env.PIAPI_API_KEY = "piapi-test";
    const stl = Buffer.alloc(120, 1);
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith("/api/v1/task") && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              code: 200,
              message: "success",
              data: { task_id: "trellis-1", status: "pending" },
            }),
        };
      }
      if (href.includes("/api/v1/task/trellis-1")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              code: 200,
              data: {
                status: "completed",
                output: { model_file: "https://cdn.example/model.stl" },
              },
            }),
        };
      }
      if (href.includes("cdn.example")) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => Uint8Array.from(stl).buffer,
        };
      }
      throw new Error(`unexpected fetch ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { generateMeshFromPrompt } = await import("../../engineering/cad-server/mesh-client");
    const result = await generateMeshFromPrompt({ prompt: "a red fox" });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("piapi-trellis");
    expect(result.meshTaskId).toBe("trellis-1");
  });

  it("reports mesh configured with only PIAPI_API_KEY", async () => {
    process.env.PIAPI_API_KEY = "piapi-test";
    const { isMeshGenerationConfigured } = await import("../../engineering/cad-server/mesh-client");
    expect(isMeshGenerationConfigured()).toBe(true);
  });

  it("uses OSS worker when MESH_WORKER_URL is set and PiAPI missing", async () => {
    process.env.MESH_WORKER_URL = "https://mesh.example.test";
    const stl = Buffer.alloc(120, 1);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          stlBase64: stl.toString("base64"),
          provider: "trellis",
        }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { generateMeshFromPrompt } = await import("../../engineering/cad-server/mesh-client");
    const result = await generateMeshFromPrompt({ prompt: "a red fox" });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("trellis");
  });
});

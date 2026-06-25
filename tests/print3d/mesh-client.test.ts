import { describe, expect, it } from "vitest";

describe("mesh-client", () => {
  it("requires API key when not configured", async () => {
    const prev = process.env.MESHY_API_KEY;
    delete process.env.MESHY_API_KEY;
    const { generateMeshFromPrompt } = await import("../../engineering/cad-server/mesh-client");
    const result = await generateMeshFromPrompt({ prompt: "cartoon mouse" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("MESHY_API_KEY");
    if (prev) process.env.MESHY_API_KEY = prev;
  });
});

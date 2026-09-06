import { afterEach, describe, expect, it } from "vitest";
import {
  buildMockStlBuffer,
  createZooJob,
  generateZooStlFromPrompt,
  isZooGenerationConfigured,
  mockZooJob,
  pollZooJob,
} from "../../engineering/cad-server/zoo-client";

describe("zoo-client", () => {
  afterEach(() => {
    delete process.env.CAD_ZOO_MOCK;
    delete process.env.ZOO_API_TOKEN;
  });

  it("mockZooJob returns real Zoo response shape", () => {
    const job = mockZooJob("bracket M3 40mm", "stl");
    expect(job.id).toMatch(/^mock-/);
    expect(job.status).toBe("completed");
    expect(job.outputs?.stl).toMatch(/^mock:\/\//);
    expect(job.createdAt).toBeTruthy();
    expect(job.completedAt).toBeTruthy();
  });

  it("buildMockStlBuffer is a valid binary STL header+triangle", () => {
    const buf = buildMockStlBuffer("test");
    expect(buf.length).toBe(134);
    expect(buf.readUInt32LE(80)).toBe(1);
  });

  it("isZooGenerationConfigured respects mock and token", () => {
    expect(isZooGenerationConfigured()).toBe(false);
    process.env.CAD_ZOO_MOCK = "1";
    expect(isZooGenerationConfigured()).toBe(true);
    delete process.env.CAD_ZOO_MOCK;
    expect(isZooGenerationConfigured("zoo-token-abcdef")).toBe(true);
  });

  it("createZooJob + pollZooJob work in mock mode", async () => {
    process.env.CAD_ZOO_MOCK = "1";
    const created = await createZooJob(
      { prompt: "gear 20mm", outputFormat: "stl" },
      "unused"
    );
    expect(created.status).toBe("completed");
    const polled = await pollZooJob(created.id, "unused");
    expect(polled.status).toBe("completed");
  });

  it("generateZooStlFromPrompt returns STL buffer in mock mode", async () => {
    process.env.CAD_ZOO_MOCK = "1";
    const result = await generateZooStlFromPrompt({ prompt: "mount plate" });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("zoo-mock");
    expect(result.stlBuffer?.length).toBeGreaterThan(80);
    expect(result.zooJobId).toMatch(/^mock-/);
  });
});

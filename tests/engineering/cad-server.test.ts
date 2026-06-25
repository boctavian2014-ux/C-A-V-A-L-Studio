import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCadServer } from "../../engineering/cad-server/server";
import { resetCadJobsForTests } from "../../engineering/cad-server/memory-store";

vi.mock("../../engineering/cad-server/llm-client", () => ({
  generateOpenScad: vi.fn(async () => ({
    ok: true,
    scad: "cube(10);",
  })),
}));

vi.mock("../../engineering/cad-server/scad-runner", () => ({
  renderScadToStl: vi.fn(async () => ({
    ok: true,
    stlBuffer: Buffer.from("solid test\nendsolid test\n"),
  })),
  fallbackScadForPrompt: vi.fn(() => "cube(5);"),
}));

describe("cad server", () => {
  beforeEach(() => {
    resetCadJobsForTests();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("responds to health endpoint", async () => {
    const app = createCadServer();
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.service).toBe("cad");
  });

  it("creates and returns a CAD job", async () => {
    const app = createCadServer();
    const created = await request(app)
      .post("/cad/jobs")
      .send({ prompt: "Capac drone 80mm", projectType: "drone" });
    expect(created.status).toBe(202);
    expect(created.body.jobId).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 50));

    const job = await request(app).get(`/cad/jobs/${created.body.jobId}`);
    expect(job.status).toBe(200);
    expect(["done", "rendering", "generating", "queued"]).toContain(job.body.status);
  });

  it("rejects empty prompt", async () => {
    const app = createCadServer();
    const response = await request(app).post("/cad/jobs").send({ prompt: "  " });
    expect(response.status).toBe(400);
  });
});

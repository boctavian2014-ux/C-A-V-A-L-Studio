import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCadServer } from "../../engineering/cad-server/server";
import { resetCadJobsForTests } from "../../engineering/cad-server/memory-store";
import { resetCadRateLimitsForTests } from "../../engineering/cad-server/middleware/rate-limit";
import { resetJobRegistryForTests } from "../../engineering/cad-server/services/job-registry";
import { resetAllJobLogsForTests } from "../../engineering/cad-server/services/job-logger";
import { resetLocalArtifactsForTests } from "../../engineering/cad-server/storage/local-artifacts";

vi.mock("../../engineering/cad-server/llm-client", () => ({
  generateOpenScad: vi.fn(async () => ({
    ok: true,
    scad: "cube(10);",
  })),
  repairOpenScad: vi.fn(async () => ({ ok: false })),
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
    process.env.CAD_ALLOW_ANONYMOUS = "1";
    delete process.env.CAD_API_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    resetCadJobsForTests();
    resetCadRateLimitsForTests();
    resetJobRegistryForTests();
    resetAllJobLogsForTests();
    resetLocalArtifactsForTests();
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
      .set("x-caval-user-id", "caval_test")
      .send({ prompt: "Capac drone 80mm", projectType: "drone" });
    expect(created.status).toBe(202);
    expect(created.body.jobId).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 80));

    const job = await request(app)
      .get(`/cad/jobs/${created.body.jobId}`)
      .set("x-caval-user-id", "caval_test");
    expect(job.status).toBe(200);
    expect(["done", "rendering", "generating", "queued"]).toContain(job.body.status);
  });

  it("rejects empty prompt", async () => {
    const app = createCadServer();
    const response = await request(app)
      .post("/cad/jobs")
      .set("x-caval-user-id", "caval_test")
      .send({ prompt: "  " });
    expect(response.status).toBe(400);
  });

  it("returns 403 for foreign job access", async () => {
    const app = createCadServer();
    const created = await request(app)
      .post("/cad/jobs")
      .set("x-caval-user-id", "owner_a")
      .send({ prompt: "Bracket 40mm", projectType: "robot" });
    const jobId = created.body.jobId as string;

    const foreign = await request(app)
      .get(`/cad/jobs/${jobId}`)
      .set("x-caval-user-id", "owner_b");
    expect(foreign.status).toBe(403);
  });

  it("cancels a job via DELETE", async () => {
    const app = createCadServer();
    const created = await request(app)
      .post("/cad/jobs")
      .set("x-caval-user-id", "caval_test")
      .send({ prompt: "Gear 20 teeth module 2", projectType: "custom" });

    const cancelled = await request(app)
      .delete(`/cad/jobs/${created.body.jobId}`)
      .set("x-caval-user-id", "caval_test");
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");
  });

  it("returns job logs", async () => {
    const app = createCadServer();
    const created = await request(app)
      .post("/cad/jobs")
      .set("x-caval-user-id", "caval_test")
      .send({ prompt: "Phone stand angled 65 degrees", projectType: "iot" });

    const logs = await request(app)
      .get(`/cad/jobs/${created.body.jobId}/logs`)
      .set("x-caval-user-id", "caval_test");
    expect(logs.status).toBe(200);
    expect(Array.isArray(logs.body.logs)).toBe(true);
    expect(logs.body.logs.length).toBeGreaterThan(0);
  });
});

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../marketplace/server/index";

describe("marketplace server", () => {
  beforeEach(() => {
    process.env.CAVAL_MARKETPLACE_JWT_SECRET = "marketplace-test-secret";
  });

  it("responds to health check", async () => {
    const app = createServer();
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("lists extensions publicly", async () => {
    const app = createServer();
    const response = await request(app).get("/api/extensions");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("rejects extension publish without auth", async () => {
    const app = createServer();
    const response = await request(app).post("/api/extensions").send({
      manifest: {
        name: "test",
        publisher: "tester",
        version: "1.0.0",
        engines: { caval: "^0.1.0" }
      }
    });
    expect(response.status).toBe(401);
  });
});

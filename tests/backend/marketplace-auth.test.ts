import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import { requireAuth } from "../../marketplace/server/middleware/auth";

describe("requireAuth middleware", () => {
  it("returns 401 without bearer token", () => {
    process.env.CAVAL_MARKETPLACE_JWT_SECRET = "test-secret";
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    requireAuth(
      { headers: {} } as never,
      { status } as never,
      vi.fn()
    );
    expect(status).toHaveBeenCalledWith(401);
  });

  it("attaches user and calls next for valid token", () => {
    process.env.CAVAL_MARKETPLACE_JWT_SECRET = "test-secret";
    const token = jwt.sign({ id: "user-1", email: "a@test.com" }, "test-secret");
    const next = vi.fn();
    const request = { headers: { authorization: `Bearer ${token}` } } as { headers: Record<string, string>; user?: unknown };
    requireAuth(request as never, {} as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect((request.user as { id: string }).id).toBe("user-1");
  });

  it("returns 401 for invalid token", () => {
    process.env.CAVAL_MARKETPLACE_JWT_SECRET = "test-secret";
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    requireAuth(
      { headers: { authorization: "Bearer invalid" } } as never,
      { status } as never,
      vi.fn()
    );
    expect(status).toHaveBeenCalledWith(401);
  });
});

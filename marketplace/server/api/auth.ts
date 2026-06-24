import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

const getTokenSecret = (): string => {
  const secret = process.env.CAVAL_MARKETPLACE_JWT_SECRET;
  if (!secret) {
    throw new Error("CAVAL_MARKETPLACE_JWT_SECRET is required.");
  }
  return secret;
};

export const createAuthRouter = (): Router => {
  const router = Router();

  router.post("/login", (request, response) => {
    const { email } = request.body as { email?: string };
    if (!email) {
      response.status(400).json({ error: "email is required" });
      return;
    }

    const user = {
      id: crypto.randomUUID(),
      cavalId: `caval_${Buffer.from(email).toString("base64url")}`,
      email
    };
    const accessToken = jwt.sign(user, getTokenSecret(), { expiresIn: "15m" });
    const refreshToken = jwt.sign({ sub: user.id, type: "refresh" }, getTokenSecret(), { expiresIn: "30d" });

    response.json({ user, accessToken, refreshToken });
  });

  router.post("/refresh", (request, response) => {
    const { refreshToken } = request.body as { refreshToken?: string };
    if (!refreshToken) {
      response.status(400).json({ error: "refreshToken is required" });
      return;
    }

    try {
      const decoded = jwt.verify(refreshToken, getTokenSecret()) as { sub?: string };
      response.json({
        accessToken: jwt.sign({ id: decoded.sub }, getTokenSecret(), { expiresIn: "15m" })
      });
    } catch {
      response.status(401).json({ error: "invalid refresh token" });
    }
  });

  return router;
};

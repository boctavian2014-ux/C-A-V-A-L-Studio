import type { Request, Response, NextFunction } from "express";
import { cadLog } from "../middleware/logger";
import { requireJwtAccount } from "../middleware/auth";
import {
  validateBody,
  validateParams,
  createProviderProfileSchema,
  rotateProviderProfileSchema,
  profileIdParamSchema,
} from "../middleware/validate";
import { cadRateLimitMiddleware } from "../middleware/rate-limit";
import { cadUnauthorized } from "../middleware/errors";
import {
  createProviderProfile,
  listProviderProfiles,
  rotateProviderProfileSecret,
  revokeProviderProfile,
} from "../services/provider-profiles";

const audit = (
  request: Request,
  event: string,
  status: "ok" | "error",
  profileId?: string,
  provider?: string
): void => {
  cadLog({
    level: status === "ok" ? "info" : "warn",
    event,
    accountId: request.cadAuth?.accountId ?? undefined,
    profileId,
    provider,
    meta: { status, path: request.path },
  });
};

const requireAccount = (request: Request): string => {
  const accountId = request.cadAuth?.accountId;
  if (!accountId) throw cadUnauthorized("Provider profiles require a verified JWT");
  return accountId;
};

export const listProfilesHandlers = [
  requireJwtAccount,
  cadRateLimitMiddleware,
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const accountId = requireAccount(request);
      const profiles = await listProviderProfiles(accountId);
      audit(request, "provider_profile_list", "ok");
      response.json({ ok: true, profiles });
    } catch (error) {
      audit(request, "provider_profile_list", "error");
      next(error);
    }
  },
];

export const createProfileHandlers = [
  requireJwtAccount,
  cadRateLimitMiddleware,
  validateBody(createProviderProfileSchema),
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const accountId = requireAccount(request);
      const body = request.body as {
        provider: string;
        secret: string;
        capabilities?: string[];
      };
      const profile = await createProviderProfile({
        accountId,
        provider: body.provider,
        secret: body.secret,
        capabilities: body.capabilities,
      });
      audit(request, "provider_profile_create", "ok", profile.id, profile.provider);
      response.status(201).json({ ok: true, profile });
    } catch (error) {
      audit(request, "provider_profile_create", "error");
      next(error);
    }
  },
];

export const rotateProfileHandlers = [
  requireJwtAccount,
  cadRateLimitMiddleware,
  validateParams(profileIdParamSchema),
  validateBody(rotateProviderProfileSchema),
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const accountId = requireAccount(request);
      const { id } = request.params as { id: string };
      const body = request.body as { secret: string };
      const profile = await rotateProviderProfileSecret({
        accountId,
        profileId: id,
        secret: body.secret,
      });
      audit(request, "provider_profile_rotate", "ok", profile.id, profile.provider);
      response.json({ ok: true, profile });
    } catch (error) {
      audit(request, "provider_profile_rotate", "error", (request.params as { id?: string }).id);
      next(error);
    }
  },
];

export const revokeProfileHandlers = [
  requireJwtAccount,
  cadRateLimitMiddleware,
  validateParams(profileIdParamSchema),
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const accountId = requireAccount(request);
      const { id } = request.params as { id: string };
      const profile = await revokeProviderProfile({
        accountId,
        profileId: id,
      });
      audit(request, "provider_profile_revoke", "ok", profile.id, profile.provider);
      response.json({ ok: true, profile });
    } catch (error) {
      audit(request, "provider_profile_revoke", "error", (request.params as { id?: string }).id);
      next(error);
    }
  },
];

import type { Request } from "express";
import { cadLog } from "../middleware/logger";
import { cadUnauthorized } from "../middleware/errors";
import {
  applyResolvedSecretToCadInput,
  resolveOwnedActiveProfileSecret,
} from "./provider-profiles";
import { stripLegacySecretFields } from "../legacy-contract";
import type { CreateCadJobInput } from "../types";

export const cadRequestClass = (body: { providerProfileId?: string }): "profile" | "legacy" =>
  body.providerProfileId ? "profile" : "legacy";

export async function attachResolvedCadSecrets(
  request: Request,
  body: Record<string, unknown> & { providerProfileId?: string }
): Promise<Record<string, unknown>> {
  const auth = request.cadAuth;
  if (!auth) throw cadUnauthorized();

  const requestClass = cadRequestClass(body);
  cadLog({
    level: "info",
    event: "cad_request",
    requestClass,
    accountId: auth.accountId ?? undefined,
    cavalId: auth.cavalId,
    profileId: body.providerProfileId,
  });

  if (requestClass === "legacy") {
    return body;
  }

  if (auth.authClass !== "jwt" || !auth.accountId) {
    throw cadUnauthorized("Provider profiles require a verified JWT");
  }

  const resolved = await resolveOwnedActiveProfileSecret({
    accountId: auth.accountId,
    profileId: body.providerProfileId!,
  });

  cadLog({
    level: "info",
    event: "provider_profile_used",
    accountId: auth.accountId,
    profileId: resolved.profile.id,
    provider: resolved.provider,
    requestClass: "profile",
  });

  const stripped = stripLegacySecretFields(body);
  return applyResolvedSecretToCadInput(stripped, resolved);
}

export const asCreateCadJobInput = (
  body: Record<string, unknown>,
  ownerId: string
): CreateCadJobInput =>
  ({
    ...body,
    cavalId: ownerId,
  }) as CreateCadJobInput;

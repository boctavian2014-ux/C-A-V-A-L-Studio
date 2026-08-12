import type { Request, Response } from "express";
import {
  isMeshGenerationConfigured,
  resolveMeshApiKey,
  resolveMeshWorkerUrl,
  resolvePiapiApiKey,
} from "../mesh-client";
import { isOpenScadInstalled } from "../scad-runner";
import { isCadPersistenceConfigured } from "../storage/index";
import { isCadAnonymousAllowed } from "../boot-guard";
import { isLegacyClientSecretPayloadEnabled } from "../legacy-contract";
import { isProfileEncryptionConfigured } from "../crypto/profile-secret";

export const cadHealthCheck = async () => ({
  ok: true,
  service: "cad",
  supabaseConfigured: isCadPersistenceConfigured(),
  openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  meshyConfigured: Boolean(resolveMeshApiKey()),
  piapiConfigured: Boolean(resolvePiapiApiKey()),
  meshWorkerConfigured: Boolean(resolveMeshWorkerUrl()),
  meshConfigured: isMeshGenerationConfigured(),
  openscadInstalled: await isOpenScadInstalled(),
  llmModel: process.env.CAD_LLM_MODEL ?? "openai/gpt-4o-mini",
  allowFallback: process.env.CAD_ALLOW_FALLBACK === "1",
  authRequired: Boolean(process.env.CAD_API_KEY) || !isCadAnonymousAllowed(),
  anonymousAllowed: isCadAnonymousAllowed(),
  legacyClientSecretPayload: isLegacyClientSecretPayloadEnabled(),
  profileVaultConfigured: isProfileEncryptionConfigured(),
  checkedAt: new Date().toISOString(),
});

export const healthRouter = async (_request: Request, response: Response): Promise<void> => {
  response.json(await cadHealthCheck());
};

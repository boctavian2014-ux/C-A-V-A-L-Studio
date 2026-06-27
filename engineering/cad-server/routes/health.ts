import type { Request, Response } from "express";
import { resolveMeshApiKey } from "../cad-capabilities";
import { isOpenScadInstalled } from "../scad-runner";
import { isCadPersistenceConfigured } from "../storage/index";

export const cadHealthCheck = async () => ({
  ok: true,
  service: "cad",
  supabaseConfigured: isCadPersistenceConfigured(),
  openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  meshyConfigured: Boolean(resolveMeshApiKey()),
  openscadInstalled: await isOpenScadInstalled(),
  llmModel: process.env.CAD_LLM_MODEL ?? "openai/gpt-4o-mini",
  allowFallback: process.env.CAD_ALLOW_FALLBACK === "1",
  authRequired: Boolean(process.env.CAD_API_KEY) || process.env.CAD_ALLOW_ANONYMOUS !== "1",
  checkedAt: new Date().toISOString(),
});

export const healthRouter = async (_request: Request, response: Response): Promise<void> => {
  response.json(await cadHealthCheck());
};

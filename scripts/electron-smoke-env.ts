import { isSecretEnvKey } from "../src/main/subprocess-env";

/** Warnings that must not fail Electron smoke (Q1-F). */
export const ELECTRON_SMOKE_WARNING_ALLOWLIST: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /Download the React DevTools/i,
    reason: "Optional React DevTools prompt in development renderer; not a boot failure.",
  },
  {
    pattern: /Invalid accelerator token/i,
    reason: "Chromium keyboard_util warning for a menu accelerator; non-fatal.",
  },
  {
    pattern: /console-message' arguments are deprecated/i,
    reason: "Electron deprecation of console-message callback arity; non-fatal.",
  },
];

export const SMOKE_FORBIDDEN_ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "POOLSIDE_API_KEY",
  "NORTH_API_KEY",
  "NVIDIA_API_KEY",
  "MESHY_API_KEY",
  "PIAPI_API_KEY",
  "TRELLIS_API_KEY",
  "CAD_API_KEY",
  "FIRECRAWL_API_KEY",
  "CAVAL_CLOUD_API_KEY",
  "CAVAL_CLOUD_AI_URL",
  "CAD_API_URL",
] as const;

export function listForbiddenSmokeKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  const hits: string[] = [];
  for (const key of SMOKE_FORBIDDEN_ENV_KEYS) {
    if (env[key]?.trim()) hits.push(key);
  }
  for (const key of Object.keys(env)) {
    if (isSecretEnvKey(key) && env[key]?.trim() && !hits.includes(key)) {
      hits.push(key);
    }
  }
  return hits;
}

export function isAllowedSmokeWarning(line: string): boolean {
  return ELECTRON_SMOKE_WARNING_ALLOWLIST.some((entry) => entry.pattern.test(line));
}

export function isFatalSmokeLine(line: string): boolean {
  if (isAllowedSmokeWarning(line)) return false;
  return (
    /\[caval-smoke\] fatal/i.test(line) ||
    /Unable to load preload script/i.test(line) ||
    /Cannot find module/i.test(line) ||
    /Renderer process gone/i.test(line) ||
    /Renderer failed to load/i.test(line) ||
    /Uncaught Exception/i.test(line) ||
    /\bFATAL\b/i.test(line)
  );
}

export function buildElectronSmokeEnv(
  source: NodeJS.ProcessEnv = process.env,
  extras: Record<string, string> = {}
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (isSecretEnvKey(key)) continue;
    if ((SMOKE_FORBIDDEN_ENV_KEYS as readonly string[]).includes(key)) continue;
    out[key] = value;
  }
  out.CAVAL_SMOKE = "1";
  out.CAD_CLOUD_ONLY = "1";
  delete out.CAD_API_URL;
  delete out.CAVAL_CLOUD_AI_URL;
  Object.assign(out, extras);
  return out;
}

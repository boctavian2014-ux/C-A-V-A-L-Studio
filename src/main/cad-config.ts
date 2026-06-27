import fsSync from "node:fs";
import path from "node:path";

/** Default Railway CAD API (override via CAD_API_URL or settings cad.apiUrl). */
export const DEFAULT_CAD_CLOUD_URL =
  process.env.CAD_CLOUD_URL?.trim() ||
  "https://c-a-v-a-l-studio-production.up.railway.app";

export function isCadCloudOnly(): boolean {
  if (process.env.CAD_CLOUD_ONLY === "0") return false;
  if (process.env.CAD_CLOUD_ONLY === "1") return true;
  return Boolean(process.versions?.electron);
}

function stripJsoncComments(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

export function readCadConfigFromCavalJsonc(): { apiUrl?: string; cloudOnly?: boolean } {
  try {
    const configPath = path.join(process.cwd(), "caval.jsonc");
    if (!fsSync.existsSync(configPath)) return {};
    const parsed = JSON.parse(stripJsoncComments(fsSync.readFileSync(configPath, "utf8"))) as {
      cad?: { apiUrl?: string; cloudOnly?: boolean };
    };
    return parsed.cad ?? {};
  } catch {
    return {};
  }
}

/** Apply CAD cloud defaults before handlers run (Electron startup). */
export function applyCadCloudEnvDefaults(): void {
  const fromFile = readCadConfigFromCavalJsonc();

  if (fromFile.cloudOnly === true) {
    process.env.CAD_CLOUD_ONLY = "1";
  } else if (fromFile.cloudOnly === false) {
    process.env.CAD_CLOUD_ONLY = "0";
  }

  if (!process.env.CAD_API_URL?.trim()) {
    const url = fromFile.apiUrl?.trim() || DEFAULT_CAD_CLOUD_URL;
    if (isCadCloudOnly() && url) {
      process.env.CAD_API_URL = url;
    }
  }
}

import { applyCadCloudEnvDefaults } from "./cad-config";
import { resetCadBaseUrlCache } from "./cad-handlers";
import {
  CAD_API_URL_CLEAR_ACTION,
  CAD_API_URL_CLEAR_VALUE,
  CAD_URL_SETTING_KEY,
  resolveCadConnectionSnapshot,
  stripCadUrlFromSettings,
  type CadConnectionSettingsSnapshot,
} from "../shared/cad-connection-settings-contract";
import { validateCadApiUrl, validateCadApiUrlSync } from "./network-guard";

let bootCadApiUrlFromEnv = false;

/** Call once at main boot before persisted settings overwrite process.env.CAD_API_URL. */
export function initCadConnectionBootEnv(): void {
  bootCadApiUrlFromEnv = Boolean(process.env.CAD_API_URL?.trim());
}

export function getBootCadApiUrlFromEnv(): boolean {
  return bootCadApiUrlFromEnv;
}

export function isCadApiUrlEnvLocked(persisted: Record<string, string>): boolean {
  return bootCadApiUrlFromEnv && !persisted[CAD_URL_SETTING_KEY]?.trim();
}

export function buildCadConnectionSnapshot(
  persisted: Record<string, string>
): CadConnectionSettingsSnapshot {
  applyCadCloudEnvDefaults();
  return resolveCadConnectionSnapshot({
    hasUserPersistedUrl: Boolean(persisted[CAD_URL_SETTING_KEY]?.trim()),
    hasBootEnvUrl: bootCadApiUrlFromEnv,
    hasEffectiveUrl: Boolean(process.env.CAD_API_URL?.trim()),
  });
}

const INVALID_CAD_URL_MESSAGE =
  "Invalid CAD API URL. Check the address and try again.";

export type CadSettingsSaveInput = Record<string, string> & {
  [CAD_API_URL_CLEAR_ACTION]?: string;
};

export async function applyCadConnectionSave(input: {
  incoming: CadSettingsSaveInput;
  persisted: Record<string, string>;
}): Promise<
  | { ok: true; merged: Record<string, string>; cadConnection: CadConnectionSettingsSnapshot }
  | { ok: false; error: string }
> {
  const { incoming, persisted } = input;

  if (isCadApiUrlEnvLocked(persisted)) {
    if (incoming[CAD_URL_SETTING_KEY]?.trim() || incoming[CAD_API_URL_CLEAR_ACTION]) {
      return {
        ok: false,
        error: "CAD API URL is managed by the environment and cannot be changed here.",
      };
    }
  }

  const merged = { ...persisted };
  const clearAction = incoming[CAD_API_URL_CLEAR_ACTION]?.trim();
  const nextUrl = incoming[CAD_URL_SETTING_KEY]?.trim();

  if (clearAction !== CAD_API_URL_CLEAR_VALUE && !nextUrl) {
    return { ok: true, merged, cadConnection: buildCadConnectionSnapshot(merged) };
  }

  if (clearAction === CAD_API_URL_CLEAR_VALUE) {
    delete merged[CAD_URL_SETTING_KEY];
    if (bootCadApiUrlFromEnv && process.env.CAD_API_URL) {
      /* env URL remains active — do not wipe process.env */
    } else {
      delete process.env.CAD_API_URL;
      applyCadCloudEnvDefaults();
    }
    resetCadBaseUrlCache();
    return { ok: true, merged, cadConnection: buildCadConnectionSnapshot(merged) };
  }

  if (nextUrl) {
    const validated = await validateCadApiUrl(nextUrl);
    if (!validated.ok) {
      return { ok: false, error: INVALID_CAD_URL_MESSAGE };
    }
    merged[CAD_URL_SETTING_KEY] = validated.normalized;
    process.env.CAD_API_URL = validated.normalized;
    resetCadBaseUrlCache();
  }

  return { ok: true, merged, cadConnection: buildCadConnectionSnapshot(merged) };
}

export function applyCadConnectionToEnv(settings: Record<string, string>): void {
  const url = settings[CAD_URL_SETTING_KEY]?.trim();
  if (url) {
    const validated = validateCadApiUrlSync(url);
    if (validated.ok) {
      process.env.CAD_API_URL = validated.normalized;
      resetCadBaseUrlCache();
      return;
    }
    console.warn("[settings] rejecting cad.apiUrl:", validated.error);
  }
}

export function buildRendererSettingsMap(
  persisted: Record<string, string>,
  extras: Record<string, string>
): { settings: Record<string, string>; cadConnection: CadConnectionSettingsSnapshot } {
  const cadConnection = buildCadConnectionSnapshot(persisted);
  const settings = stripCadUrlFromSettings({ ...persisted, ...extras });
  delete settings[CAD_URL_SETTING_KEY];
  return { settings, cadConnection };
}

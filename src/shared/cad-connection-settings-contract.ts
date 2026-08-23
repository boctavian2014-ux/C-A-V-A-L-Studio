/**
 * Renderer-safe CAD connection settings — no URL, host, or origin exposure.
 */

export const CAD_CONNECTION_SOURCES = ["env", "user", "default", "none"] as const;
export type CadConnectionSource = (typeof CAD_CONNECTION_SOURCES)[number];

export const CAD_CONNECTION_SNAPSHOT_KEYS = ["configured", "source"] as const;

export type CadConnectionSettingsSnapshot = {
  configured: boolean;
  source: CadConnectionSource;
};

export const CAD_URL_SETTING_KEY = "cad.apiUrl" as const;
export const CAD_API_URL_CLEAR_ACTION = "cadApiUrlAction" as const;
export const CAD_API_URL_CLEAR_VALUE = "clear" as const;

/** Pure precedence: user persisted > boot env > cloud default > none. */
export function resolveCadConnectionSnapshot(input: {
  hasUserPersistedUrl: boolean;
  hasBootEnvUrl: boolean;
  hasEffectiveUrl: boolean;
}): CadConnectionSettingsSnapshot {
  if (input.hasUserPersistedUrl) {
    return { configured: true, source: "user" };
  }
  if (input.hasBootEnvUrl && input.hasEffectiveUrl) {
    return { configured: true, source: "env" };
  }
  if (input.hasEffectiveUrl) {
    return { configured: true, source: "default" };
  }
  return { configured: false, source: "none" };
}

export function stripCadUrlFromSettings(
  settings: Record<string, string>
): Record<string, string> {
  const out = { ...settings };
  delete out[CAD_URL_SETTING_KEY];
  return out;
}

/** Test helper — detects URL-like leaks in serialized IPC payloads. */
export function containsCadUrlLeak(text: string, configuredHost?: string): boolean {
  if (/https?:\/\//i.test(text)) return true;
  if (/railway\.app/i.test(text)) return true;
  if (/"cad\.apiUrl"/i.test(text)) return true;
  if (configuredHost?.trim() && text.includes(configuredHost.trim())) return true;
  return false;
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CAD_API_URL_CLEAR_ACTION,
  CAD_API_URL_CLEAR_VALUE,
  CAD_URL_SETTING_KEY,
  containsCadUrlLeak,
} from "../../src/shared/cad-connection-settings-contract";

const CUSTOM_HOST = "test-custom.up.railway.app";
const CUSTOM_URL = `https://${CUSTOM_HOST}`;
const ENV_HOST = "env-managed.up.railway.app";
const ENV_URL = `https://${ENV_HOST}`;

describe("cad connection settings (main)", () => {
  const prevEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    vi.resetModules();
    for (const key of ["CAD_API_URL", "CAD_CLOUD_ONLY", "CAD_USE_LOCAL"]) {
      prevEnv[key] = process.env[key];
    }
    process.env.CAD_CLOUD_ONLY = "1";
    delete process.env.CAD_USE_LOCAL;
    delete process.env.CAD_API_URL;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function loadModule() {
    const mod = await import("../../src/main/cad-connection-settings.js");
    mod.initCadConnectionBootEnv();
    return mod;
  }

  it("buildRendererSettingsMap never exposes cad.apiUrl or env URL on load", async () => {
    process.env.CAD_API_URL = ENV_URL;
    const { initCadConnectionBootEnv, buildRendererSettingsMap } = await loadModule();
    initCadConnectionBootEnv();

    const { settings, cadConnection } = buildRendererSettingsMap(
      {},
      { "cad.configured": "false" }
    );

    expect(cadConnection).toEqual({ configured: true, source: "env" });
    expect(settings["cad.apiUrl"]).toBeUndefined();
    expect(containsCadUrlLeak(JSON.stringify({ settings, cadConnection }), ENV_HOST)).toBe(false);
  });

  it("returns user source when a custom URL is persisted", async () => {
    const { buildRendererSettingsMap } = await loadModule();
    const { cadConnection } = buildRendererSettingsMap(
      { [CAD_URL_SETTING_KEY]: CUSTOM_URL },
      {}
    );
    expect(cadConnection.source).toBe("user");
    expect(cadConnection.configured).toBe(true);
  });

  it("saves a custom URL without echoing it back to the renderer", async () => {
    const { applyCadConnectionSave } = await loadModule();
    const result = await applyCadConnectionSave({
      incoming: { [CAD_URL_SETTING_KEY]: CUSTOM_URL },
      persisted: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.merged[CAD_URL_SETTING_KEY]).toBe(CUSTOM_URL);
    expect(result.cadConnection.source).toBe("user");
    expect(containsCadUrlLeak(JSON.stringify(result.cadConnection), CUSTOM_HOST)).toBe(false);
    expect(process.env.CAD_API_URL).toBe(CUSTOM_URL);
  });

  it("clears custom URL and falls back without leaking resulting URL", async () => {
    process.env.CAD_API_URL = ENV_URL;
    const { initCadConnectionBootEnv, applyCadConnectionSave } = await loadModule();
    initCadConnectionBootEnv();

    const result = await applyCadConnectionSave({
      incoming: { [CAD_API_URL_CLEAR_ACTION]: CAD_API_URL_CLEAR_VALUE },
      persisted: { [CAD_URL_SETTING_KEY]: CUSTOM_URL },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.merged[CAD_URL_SETTING_KEY]).toBeUndefined();
    expect(result.cadConnection.source).toBe("env");
    expect(containsCadUrlLeak(JSON.stringify(result.cadConnection), ENV_HOST)).toBe(false);
    expect(containsCadUrlLeak(JSON.stringify(result.cadConnection), CUSTOM_HOST)).toBe(false);
  });

  it("blocks save and clear when env-managed and no user override exists", async () => {
    process.env.CAD_API_URL = ENV_URL;
    const { initCadConnectionBootEnv, applyCadConnectionSave } = await loadModule();
    initCadConnectionBootEnv();

    const saveAttempt = await applyCadConnectionSave({
      incoming: { [CAD_URL_SETTING_KEY]: CUSTOM_URL },
      persisted: {},
    });
    expect(saveAttempt.ok).toBe(false);

    const clearAttempt = await applyCadConnectionSave({
      incoming: { [CAD_API_URL_CLEAR_ACTION]: CAD_API_URL_CLEAR_VALUE },
      persisted: {},
    });
    expect(clearAttempt.ok).toBe(false);
  });

  it("returns generic validation errors without upstream host details", async () => {
    const { applyCadConnectionSave } = await loadModule();
    const result = await applyCadConnectionSave({
      incoming: { [CAD_URL_SETTING_KEY]: "http://127.0.0.1:9999" },
      persisted: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Invalid CAD API URL");
    expect(containsCadUrlLeak(result.error, "127.0.0.1")).toBe(false);
  });
});

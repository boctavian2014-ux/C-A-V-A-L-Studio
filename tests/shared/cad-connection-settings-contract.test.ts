import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CAD_CONNECTION_SNAPSHOT_KEYS,
  containsCadUrlLeak,
  resolveCadConnectionSnapshot,
  stripCadUrlFromSettings,
} from "../../src/shared/cad-connection-settings-contract";

const HOST = "c-a-v-a-l-studio-production.up.railway.app";

describe("resolveCadConnectionSnapshot", () => {
  it("prefers user persisted over env and default", () => {
    expect(
      resolveCadConnectionSnapshot({
        hasUserPersistedUrl: true,
        hasBootEnvUrl: true,
        hasEffectiveUrl: true,
      })
    ).toEqual({ configured: true, source: "user" });
  });

  it("uses env when no user persisted URL", () => {
    expect(
      resolveCadConnectionSnapshot({
        hasUserPersistedUrl: false,
        hasBootEnvUrl: true,
        hasEffectiveUrl: true,
      })
    ).toEqual({ configured: true, source: "env" });
  });

  it("uses default when only effective cloud default is present", () => {
    expect(
      resolveCadConnectionSnapshot({
        hasUserPersistedUrl: false,
        hasBootEnvUrl: false,
        hasEffectiveUrl: true,
      })
    ).toEqual({ configured: true, source: "default" });
  });

  it("returns none when no effective URL exists", () => {
    expect(
      resolveCadConnectionSnapshot({
        hasUserPersistedUrl: false,
        hasBootEnvUrl: false,
        hasEffectiveUrl: false,
      })
    ).toEqual({ configured: false, source: "none" });
  });
});

describe("stripCadUrlFromSettings", () => {
  it("removes cad.apiUrl without touching other keys", () => {
    expect(
      stripCadUrlFromSettings({
        "cad.apiUrl": `https://${HOST}`,
        "ui.locale": "en",
      })
    ).toEqual({ "ui.locale": "en" });
  });
});

describe("containsCadUrlLeak", () => {
  it("detects URL-like IPC leaks", () => {
    expect(containsCadUrlLeak(`https://${HOST}`, HOST)).toBe(true);
    expect(containsCadUrlLeak("railway.app")).toBe(true);
    expect(containsCadUrlLeak('"cad.apiUrl"')).toBe(true);
    expect(
      containsCadUrlLeak(JSON.stringify({ configured: true, source: "env" }), HOST)
    ).toBe(false);
  });
});

describe("snapshot allowlist", () => {
  it("uses only configured and source", () => {
    const snap = resolveCadConnectionSnapshot({
      hasUserPersistedUrl: false,
      hasBootEnvUrl: false,
      hasEffectiveUrl: true,
    });
    expect(Object.keys(snap).sort()).toEqual([...CAD_CONNECTION_SNAPSHOT_KEYS].sort());
  });
});

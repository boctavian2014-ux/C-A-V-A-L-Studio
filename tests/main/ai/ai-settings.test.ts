import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  aiSettingsPath,
  loadAiSettingsSync,
  resetAiSettingsSync,
  updateAiSettingsSync,
} from "../../../src/main/ai/ai-settings";
import { DEFAULT_AI_SETTINGS } from "../../../src/shared/ai-settings-contract";
import { redactSensitiveCommandOutput } from "../../../src/shared/command-output-redaction";

describe("7e.3 AI settings", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function tempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(root);
    return root;
  }

  it("loads defaults when settings file is missing", () => {
    const root = tempRoot("caval-7e3-defaults-");
    const settings = loadAiSettingsSync(root);
    expect(settings).toEqual(DEFAULT_AI_SETTINGS);
    expect(fs.existsSync(aiSettingsPath(root))).toBe(false);
  });

  it("updates settings with clamped caps and persists to disk", () => {
    const root = tempRoot("caval-7e3-update-");
    const updated = updateAiSettingsSync(root, {
      messageCapKB: 999,
      snapshotCapKB: 1,
      toolsEnabled: { ...DEFAULT_AI_SETTINGS.toolsEnabled, run_task: false },
      redactionLevel: "strict",
      timelineDetail: "verbose",
    });
    expect(updated.messageCapKB).toBe(128);
    expect(updated.snapshotCapKB).toBe(16);
    expect(updated.toolsEnabled.run_task).toBe(false);
    expect(updated.redactionLevel).toBe("strict");
    expect(updated.timelineDetail).toBe("verbose");

    const reloaded = loadAiSettingsSync(root);
    expect(reloaded).toEqual(updated);
    expect(fs.existsSync(aiSettingsPath(root))).toBe(true);
  });

  it("resets to defaults", () => {
    const root = tempRoot("caval-7e3-reset-");
    updateAiSettingsSync(root, { messageCapKB: 64, timelineDetail: "verbose" });
    const reset = resetAiSettingsSync(root);
    expect(reset).toEqual(DEFAULT_AI_SETTINGS);
    expect(loadAiSettingsSync(root)).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("minimal redaction still strips critical secrets", () => {
    const raw =
      "key=sk-abcdefghijklmnopqrstuvwxyz hello world API_KEY=plain-should-stay-at-minimal";
    const minimal = redactSensitiveCommandOutput(raw, "minimal");
    expect(minimal).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(minimal).toContain("[REDACTED]");
    // Env-style API_KEY= is standard-level; minimal may leave non-sk values.
    const standard = redactSensitiveCommandOutput("API_KEY=supersecretvalue123", "standard");
    expect(standard).toContain("[REDACTED]");
    expect(standard).not.toContain("supersecretvalue123");
  });
});

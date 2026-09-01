import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  readAgenticCloudAvailability,
  toDeniedAgenticAvailability,
} from "../../src/main/agentic-availability";
import { AGENTIC_AVAILABILITY_CHANNEL } from "../../src/shared/agentic-availability";

const KEYS = [
  "NVIDIA_API_KEY",
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
] as const;

const saved: Record<string, string | undefined> = {};

function snapshotEnv(): void {
  for (const key of KEYS) saved[key] = process.env[key];
}

function restoreEnv(): void {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function clearCloudKeys(): void {
  for (const key of KEYS) delete process.env[key];
}

snapshotEnv();

afterEach(() => {
  restoreEnv();
});

describe("agentic availability IPC contract", () => {
  it("exposes a boolean IPC method from preload without process.env", () => {
    const preload = readFileSync(path.join(__dirname, "../../src/main/preload.ts"), "utf8");
    expect(preload).toContain("getAgenticAvailability");
    expect(preload).toContain("AGENTIC_AVAILABILITY_CHANNEL");
    expect(preload).not.toMatch(/exposeInMainWorld\([\s\S]*process\.env/);
  });

  it("uses a dedicated channel and never returns env keys", () => {
    expect(AGENTIC_AVAILABILITY_CHANNEL).toBe("caval:build-mode-get-agentic-availability");
    clearCloudKeys();
    const denied = toDeniedAgenticAvailability(new Error("Untrusted IPC sender"));
    expect(denied).toEqual({
      ok: false,
      available: false,
      error: "Untrusted IPC sender",
    });
    expect(JSON.stringify(denied)).not.toMatch(/NVIDIA|OPENROUTER|API_KEY/);
  });

  it("reports unavailable when no cloud provider is configured", () => {
    clearCloudKeys();
    expect(readAgenticCloudAvailability()).toEqual({ ok: true, available: false });
  });

  it("reports available when NVIDIA is configured", () => {
    clearCloudKeys();
    process.env.NVIDIA_API_KEY = "nvapi-test-not-a-real-key-xxxx";
    expect(readAgenticCloudAvailability()).toEqual({ ok: true, available: true });
  });
});

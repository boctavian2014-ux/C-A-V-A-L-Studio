import { describe, expect, it } from "vitest";

import {
  getOllamaLoopbackUrl,
  localAiStatusFingerprint,
  OLLAMA_HEALTH_TIMEOUT_MS,
  OLLAMA_LOOPBACK_URL,
  OLLAMA_START_DELAYS_MS,
  OLLAMA_TAGS_URL,
  sanitizeLocalAiReason,
  toProviderStatus,
  type LocalAiStatus,
} from "../../src/shared/local-ai-contract";
import { mapOllamaToProviderStatus } from "../../src/shared/ai-provider-contract";

function baseStatus(partial: Partial<LocalAiStatus>): LocalAiStatus {
  return {
    phase: "unavailable",
    installed: false,
    reachable: false,
    managedByCaval: false,
    defaultModel: "qwen2.5-coder:7b",
    defaultModelReady: false,
    endpoint: OLLAMA_LOOPBACK_URL,
    updatedAt: 1,
    supported: true,
    platform: "win32",
    running: false,
    configuredUrl: OLLAMA_LOOPBACK_URL,
    models: [],
    inProgress: false,
    policy: "test",
    ...partial,
  };
}

describe("7f.2 local-ai status contract", () => {
  it("uses canonical 127.0.0.1 loopback endpoints", () => {
    expect(getOllamaLoopbackUrl()).toBe("http://127.0.0.1:11434");
    expect(OLLAMA_TAGS_URL).toBe("http://127.0.0.1:11434/api/tags");
    expect(OLLAMA_TAGS_URL).not.toContain("localhost");
    expect(OLLAMA_HEALTH_TIMEOUT_MS).toBe(1_500);
    expect([...OLLAMA_START_DELAYS_MS]).toEqual([500, 1_000, 2_000]);
  });

  it("maps LocalAiPhase to ProviderStatus (7f.1 regression)", () => {
    expect(toProviderStatus({ phase: "ready" })).toBe("configured");
    expect(toProviderStatus({ phase: "starting" })).toBe("starting");
    expect(toProviderStatus({ phase: "not-installed" })).toBe("not-installed");
    expect(toProviderStatus({ phase: "model-missing" })).toBe("model-missing");
    expect(toProviderStatus({ phase: "unavailable" })).toBe("unavailable");
    expect(
      mapOllamaToProviderStatus({
        installed: true,
        running: true,
        defaultModelReady: true,
        phase: "ready",
      })
    ).toBe("configured");
  });

  it("fingerprints ignore updatedAt and dedupe identical material state", () => {
    const a = baseStatus({ phase: "ready", installed: true, reachable: true, defaultModelReady: true });
    const b = baseStatus({
      phase: "ready",
      installed: true,
      reachable: true,
      defaultModelReady: true,
      updatedAt: 999,
    });
    expect(localAiStatusFingerprint(a)).toBe(localAiStatusFingerprint(b));
    const c = baseStatus({ phase: "starting", installed: true, reachable: false });
    expect(localAiStatusFingerprint(a)).not.toBe(localAiStatusFingerprint(c));
  });

  it("sanitizes reasons without paths or raw stderr", () => {
    expect(sanitizeLocalAiReason("Ollama is not installed on this system")).toBe(
      "Ollama was not found"
    );
    expect(sanitizeLocalAiReason("Ollama did not become ready within ~5s")).toBe(
      "Ollama did not respond in time"
    );
    expect(sanitizeLocalAiReason("C:\\Users\\me\\ollama.exe crashed")).toBe(
      "Ollama is unavailable"
    );
  });
});

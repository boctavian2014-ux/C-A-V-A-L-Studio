import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
  },
}));

vi.mock("../../src/main/local-ai-setup", () => ({
  getLocalAiStatus: vi.fn(async () => {
    throw new Error("inject localAiStatus in tests");
  }),
}));

import { buildAiProvidersSnapshot } from "../../src/main/ai/provider-registry";
import type { LocalAiStatus } from "../../src/shared/local-ai-contract";
import { OLLAMA_LOOPBACK_URL } from "../../src/shared/local-ai-contract";

function localReady(): LocalAiStatus {
  return {
    phase: "ready",
    installed: true,
    reachable: true,
    managedByCaval: false,
    defaultModel: "qwen2.5-coder:7b",
    defaultModelReady: true,
    endpoint: OLLAMA_LOOPBACK_URL,
    updatedAt: 1,
    supported: true,
    platform: "win32",
    running: true,
    configuredUrl: OLLAMA_LOOPBACK_URL,
    models: ["qwen2.5-coder:7b"],
    inProgress: false,
    policy: "test",
  };
}

describe("7f.4 provider registry custom", () => {
  it("marks custom not-configured without baseUrl/modelId", async () => {
    const snapshot = await buildAiProvidersSnapshot({
      configured: {},
      localAiStatus: localReady(),
    });
    const custom = snapshot.providers.find((p) => p.id === "custom");
    expect(custom?.status).toBe("not-configured");
    expect(custom?.selectable).toBe(true);
    expect(custom?.comingSoon).toBeFalsy();
  });

  it("marks custom configured after valid save flags", async () => {
    const snapshot = await buildAiProvidersSnapshot({
      configured: {
        CUSTOM_PROVIDER_BASE_URL: true,
        CUSTOM_PROVIDER_MODEL_ID: true,
        CUSTOM_PROVIDER_API_KEY: true,
      },
      preferredProviderId: "custom",
      localAiStatus: localReady(),
    });
    const custom = snapshot.providers.find((p) => p.id === "custom");
    expect(custom?.status).toBe("configured");
    expect(snapshot.preferredProviderId).toBe("custom");
  });

  it("leaves other providers unchanged", async () => {
    const snapshot = await buildAiProvidersSnapshot({
      configured: {
        OPENAI_API_KEY: true,
        CUSTOM_PROVIDER_BASE_URL: true,
        CUSTOM_PROVIDER_MODEL_ID: true,
      },
      localAiStatus: localReady(),
    });
    expect(snapshot.providers.find((p) => p.id === "openai")?.status).toBe("configured");
    expect(snapshot.providers.find((p) => p.id === "anthropic")?.status).toBe("not-configured");
    expect(snapshot.providers.find((p) => p.id === "ollama")?.status).toBe("configured");
  });
});

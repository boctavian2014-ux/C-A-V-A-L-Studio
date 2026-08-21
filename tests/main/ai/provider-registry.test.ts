import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
  },
}));

vi.mock("../../../src/main/local-ai-setup", () => ({
  getLocalAiStatus: vi.fn(async () => {
    throw new Error("getLocalAiStatus should be injected in tests");
  }),
}));

import {
  AI_PROVIDER_IDS,
  mapCloudKeyConfigured,
  mapOllamaToProviderStatus,
  statusLabel,
} from "../../../src/shared/ai-provider-contract";
import {
  buildAiProvidersSnapshot,
  resolvePreferredProviderId,
} from "../../../src/main/ai/provider-registry";

describe("7f.1 provider status mapping", () => {
  it("maps Ollama phase fields to ProviderStatus", () => {
    expect(
      mapOllamaToProviderStatus({
        installed: false,
        running: false,
        defaultModelReady: false,
        phase: "unavailable",
      })
    ).toBe("not-installed");

    expect(
      mapOllamaToProviderStatus({
        installed: true,
        running: false,
        defaultModelReady: false,
        phase: "starting",
      })
    ).toBe("starting");

    expect(
      mapOllamaToProviderStatus({
        installed: true,
        running: true,
        defaultModelReady: false,
        phase: "running",
      })
    ).toBe("model-missing");

    expect(
      mapOllamaToProviderStatus({
        installed: true,
        running: true,
        defaultModelReady: true,
        phase: "running",
      })
    ).toBe("configured");

    expect(
      mapOllamaToProviderStatus({
        installed: true,
        running: false,
        defaultModelReady: false,
        phase: "unavailable",
      })
    ).toBe("unavailable");
  });

  it("maps cloud key presence", () => {
    expect(mapCloudKeyConfigured(true)).toBe("configured");
    expect(mapCloudKeyConfigured(false)).toBe("not-configured");
    expect(statusLabel("not-configured")).toBe("Not configured");
  });
});

describe("7f.1 provider registry", () => {
  it("returns all six providers with Ollama first and custom coming soon", async () => {
    const snapshot = await buildAiProvidersSnapshot({
      configured: {
        OPENAI_API_KEY: true,
        OPENROUTER_API_KEY: false,
      },
      preferredProviderId: "openai",
      encryptionAvailable: true,
      localAiStatus: {
        supported: true,
        platform: "win32",
        installed: true,
        running: true,
        configuredUrl: "http://127.0.0.1:11434",
        models: ["qwen2.5-coder:7b"],
        defaultModel: "qwen2.5-coder:7b",
        defaultModelReady: true,
        managedByCaval: false,
        inProgress: false,
        phase: "running",
        policy: "test",
      },
    });

    expect(snapshot.providers.map((p) => p.id)).toEqual([...AI_PROVIDER_IDS]);
    expect(snapshot.providers[0]?.id).toBe("ollama");
    expect(snapshot.providers[0]?.label).toBe("Local & Free");
    expect(snapshot.providers[0]?.status).toBe("configured");
    expect(snapshot.providers.find((p) => p.id === "openai")?.status).toBe("configured");
    expect(snapshot.providers.find((p) => p.id === "openrouter")?.status).toBe("not-configured");
    const custom = snapshot.providers.find((p) => p.id === "custom");
    expect(custom?.comingSoon).toBe(true);
    expect(custom?.selectable).toBe(false);
    expect(snapshot.preferredProviderId).toBe("openai");
    expect(snapshot.encryptionAvailable).toBe(true);
  });

  it("maps Ollama not-installed and model-missing in registry", async () => {
    const missingInstall = await buildAiProvidersSnapshot({
      configured: {},
      encryptionAvailable: false,
      localAiStatus: {
        supported: true,
        platform: "linux",
        installed: false,
        running: false,
        configuredUrl: "http://127.0.0.1:11434",
        models: [],
        defaultModel: "qwen2.5-coder:7b",
        defaultModelReady: false,
        managedByCaval: false,
        inProgress: false,
        phase: "unavailable",
        policy: "test",
      },
    });
    expect(missingInstall.providers[0]?.status).toBe("not-installed");
    expect(missingInstall.encryptionAvailable).toBe(false);

    const missingModel = await buildAiProvidersSnapshot({
      configured: {},
      localAiStatus: {
        supported: true,
        platform: "linux",
        installed: true,
        running: true,
        configuredUrl: "http://127.0.0.1:11434",
        models: [],
        defaultModel: "qwen2.5-coder:7b",
        defaultModelReady: false,
        managedByCaval: false,
        inProgress: false,
        phase: "running",
        policy: "test",
      },
    });
    expect(missingModel.providers[0]?.status).toBe("model-missing");
  });

  it("rejects custom as preferred", () => {
    expect(resolvePreferredProviderId("custom")).toBe("ollama");
    expect(resolvePreferredProviderId("anthropic")).toBe("anthropic");
  });
});

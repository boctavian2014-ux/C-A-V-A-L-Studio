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
import type { LocalAiStatus } from "../../../src/shared/local-ai-contract";
import { OLLAMA_LOOPBACK_URL } from "../../../src/shared/local-ai-contract";

function localStatus(partial: Partial<LocalAiStatus> & Pick<LocalAiStatus, "phase">): LocalAiStatus {
  return {
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

describe("7f.1 provider status mapping", () => {
  it("maps Ollama phase fields to ProviderStatus", () => {
    expect(
      mapOllamaToProviderStatus({
        installed: false,
        running: false,
        defaultModelReady: false,
        phase: "not-installed",
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
        phase: "model-missing",
      })
    ).toBe("model-missing");

    expect(
      mapOllamaToProviderStatus({
        installed: true,
        running: true,
        defaultModelReady: true,
        phase: "ready",
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
  it("returns all seven providers with Ollama first; NVIDIA NIM and custom are selectable", async () => {
    const snapshot = await buildAiProvidersSnapshot({
      configured: {
        OPENAI_API_KEY: true,
        OPENROUTER_API_KEY: false,
      },
      preferredProviderId: "openai",
      encryptionAvailable: true,
      localAiStatus: localStatus({
        installed: true,
        running: true,
        reachable: true,
        models: ["qwen2.5-coder:7b"],
        defaultModelReady: true,
        phase: "ready",
      }),
    });

    expect(snapshot.providers.map((p) => p.id)).toEqual([...AI_PROVIDER_IDS]);
    expect(snapshot.providers[0]?.id).toBe("ollama");
    expect(snapshot.providers[0]?.label).toBe("Local & Free");
    expect(snapshot.providers[0]?.status).toBe("configured");
    expect(snapshot.providers.find((p) => p.id === "openai")?.status).toBe("configured");
    expect(snapshot.providers.find((p) => p.id === "openrouter")?.status).toBe("not-configured");
    const nvidia = snapshot.providers.find((p) => p.id === "nvidia");
    expect(nvidia?.selectable).toBe(true);
    expect(nvidia?.secretKey).toBe("NVIDIA_API_KEY");
    expect(nvidia?.status).toBe("not-configured");
    const custom = snapshot.providers.find((p) => p.id === "custom");
    expect(custom?.comingSoon).toBeFalsy();
    expect(custom?.selectable).toBe(true);
    expect(custom?.status).toBe("not-configured");
    expect(snapshot.preferredProviderId).toBe("openai");
    expect(snapshot.encryptionAvailable).toBe(true);
  });

  it("maps Ollama not-installed and model-missing in registry", async () => {
    const missingInstall = await buildAiProvidersSnapshot({
      configured: {},
      encryptionAvailable: false,
      localAiStatus: localStatus({
        installed: false,
        phase: "not-installed",
      }),
    });
    expect(missingInstall.providers[0]?.status).toBe("not-installed");
    expect(missingInstall.encryptionAvailable).toBe(false);

    const missingModel = await buildAiProvidersSnapshot({
      configured: {},
      localAiStatus: localStatus({
        installed: true,
        running: true,
        reachable: true,
        models: [],
        defaultModelReady: false,
        phase: "model-missing",
      }),
    });
    expect(missingModel.providers[0]?.status).toBe("model-missing");
  });

  it("allows custom as preferred", () => {
    expect(resolvePreferredProviderId("custom")).toBe("custom");
    expect(resolvePreferredProviderId("anthropic")).toBe("anthropic");
  });
});

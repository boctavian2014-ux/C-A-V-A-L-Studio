import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpChatProvider } from "../../ai/providers/http-chat-provider";
import {
  NvidiaProvider,
  probeNvidiaNimConnection,
} from "../../ai/providers/nvidia";
import {
  AGENTIC_NVIDIA_FALLBACK_PROFILE_ID,
  AGENTIC_NVIDIA_PRIMARY_PROFILE_ID,
  LOCAL_OFFLINE_CATALOG,
  NVIDIA_FAST_PROFILE_ID,
  NVIDIA_NIM_BASE_URL,
  NVIDIA_NIM_CATALOG,
  NVIDIA_NIM_CHAT_COMPLETIONS_URL,
  isAgenticNimModel,
} from "../../ai/models/nvidia-nim-catalog";
import { getModelProfile, getProviderProfiles } from "../../ai/model-profiles";
import { resolveProviderModelId } from "../../ai/models/provider-model-id";

describe("NVIDIA NIM first-class provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exposes a typed catalog with providerId, modelId, displayName, tier, supportsTools, recommendedFor", () => {
    expect(NVIDIA_NIM_BASE_URL).toBe("https://integrate.api.nvidia.com/v1");
    expect(NVIDIA_NIM_CHAT_COMPLETIONS_URL).toBe(
      "https://integrate.api.nvidia.com/v1/chat/completions"
    );
    for (const entry of NVIDIA_NIM_CATALOG) {
      expect(entry.providerId).toBe("nvidia");
      expect(entry.modelId.length).toBeGreaterThan(0);
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(["agentic", "code", "fast", "local"]).toContain(entry.tier);
      expect(typeof entry.supportsTools).toBe("boolean");
      expect(entry.recommendedFor.length).toBeGreaterThan(0);
      const profile = getModelProfile(entry.profileId);
      expect(profile?.provider).toBe("nvidia");
      expect(profile?.providerModelId).toBe(entry.modelId);
      expect(profile?.supportsToolCalling).toBe(entry.supportsTools);
      expect(profile?.endpoint).toBe(NVIDIA_NIM_CHAT_COMPLETIONS_URL);
    }
    expect(isAgenticNimModel(AGENTIC_NVIDIA_PRIMARY_PROFILE_ID)).toBe(true);
    expect(isAgenticNimModel(AGENTIC_NVIDIA_FALLBACK_PROFILE_ID)).toBe(true);
    expect(isAgenticNimModel(NVIDIA_FAST_PROFILE_ID)).toBe(false);
    expect(LOCAL_OFFLINE_CATALOG[0]?.supportsTools).toBe(false);
    expect(LOCAL_OFFLINE_CATALOG[0]?.tier).toBe("local");
  });

  it("reuses HttpChatProvider without a second HTTP client", () => {
    const provider = new NvidiaProvider();
    expect(provider).toBeInstanceOf(HttpChatProvider);
    expect(provider.name).toBe("nvidia");
    const models = provider.models();
    const ids = models.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(getProviderProfiles("nvidia").map((p) => p.id)));
    const flash = models.find((m) => m.id === AGENTIC_NVIDIA_PRIMARY_PROFILE_ID);
    expect(flash).toBeDefined();
    expect(resolveProviderModelId(flash!)).toBe("deepseek-ai/deepseek-v4-flash-0731");
  });

  it("probes NVIDIA NIM via the OpenAI-compatible client", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toBe(`${NVIDIA_NIM_BASE_URL}/models`);
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await probeNvidiaNimConnection({ apiKey: "nvapi-test-key-12345" });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> };
    expect(headers?.headers?.authorization).toBe("Bearer nvapi-test-key-12345");
  });
});

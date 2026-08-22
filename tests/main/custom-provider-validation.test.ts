import { describe, expect, it } from "vitest";

import {
  getCustomProviderStatus,
  isAllowedCustomUrl,
} from "../../src/shared/ai-provider-contract";
import { validateSecretFormat, validateSecretsPatchFormats } from "../../src/main/byok-key-format";
import { createCustomProvider } from "../../ai/providers/custom-openai-compatible";

describe("7f.4 custom provider URL validation", () => {
  it("accepts loopback http URLs", () => {
    expect(isAllowedCustomUrl("http://localhost:1234/v1")).toBe(true);
    expect(isAllowedCustomUrl("http://127.0.0.1:1234/v1")).toBe(true);
    expect(isAllowedCustomUrl("http://[::1]:1234/v1")).toBe(true);
  });

  it("rejects non-loopback http", () => {
    expect(isAllowedCustomUrl("http://192.168.1.5:1234/v1")).toBe(false);
    expect(isAllowedCustomUrl("http://evil.example/v1")).toBe(false);
  });

  it("accepts https remote URLs", () => {
    expect(isAllowedCustomUrl("https://my-remote-server.com/v1")).toBe(true);
  });

  it("secrets-set format rejects invalid custom URL", () => {
    const result = validateSecretsPatchFormats({
      CUSTOM_PROVIDER_BASE_URL: "http://192.168.1.5:1234/v1",
      CUSTOM_PROVIDER_MODEL_ID: "local-model",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.key).toBe("CUSTOM_PROVIDER_BASE_URL");
      expect(result.error).toMatch(/localhost|loopback|https/i);
    }
  });

  it("validateSecretFormat accepts valid custom fields", () => {
    expect(validateSecretFormat("CUSTOM_PROVIDER_BASE_URL", "http://localhost:1234/v1").ok).toBe(
      true
    );
    expect(validateSecretFormat("CUSTOM_PROVIDER_MODEL_ID", "qwen").ok).toBe(true);
    expect(validateSecretFormat("CUSTOM_PROVIDER_LABEL", "LM Studio").ok).toBe(true);
  });

  it("createCustomProvider reuses HttpChatProvider subclass", () => {
    const provider = createCustomProvider({
      baseUrl: "http://localhost:1234/v1/",
      modelId: "local-model",
      label: "LM Studio",
    });
    expect(provider.name).toBe("custom");
    const models = provider.models();
    expect(models[0]?.endpoint).toBe("http://localhost:1234/v1/chat/completions");
    expect(models[0]?.providerModelId).toBe("local-model");
  });

  it("getCustomProviderStatus requires baseUrl and modelId", () => {
    expect(getCustomProviderStatus({})).toBe("not-configured");
    expect(
      getCustomProviderStatus({ CUSTOM_PROVIDER_BASE_URL: true })
    ).toBe("not-configured");
    expect(
      getCustomProviderStatus({
        CUSTOM_PROVIDER_BASE_URL: true,
        CUSTOM_PROVIDER_MODEL_ID: true,
      })
    ).toBe("configured");
  });
});

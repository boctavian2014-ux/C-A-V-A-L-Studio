import { describe, expect, it, beforeEach } from "vitest";

import { ModelRetryPolicy } from "../../ai/model-retry";
import {
  SafeProviderError,
  safeErrorFromHttpStatus,
  safeErrorMessageForUi,
  isNeverRetryAuthError,
} from "../../ai/providers/provider-errors";
import { assertOllamaBaseUrl, assertProviderRequestUrl } from "../../src/main/cloud-provider-registry";
import {
  allowAiAbort,
  consumeAiRateLimit,
  resetAiRateLimitsForTests,
} from "../../src/main/ai-rate-limit";
import { validateSecretFormat, validateSecretsPatchFormats } from "../../src/main/byok-key-format";
import { redactSensitiveText } from "../../src/shared/command-output-redaction";
import { assertTrustedSender } from "../../src/main/ipc-trust";

describe("Lot C5.1 — provider errors + retry", () => {
  it("maps 401/403 to auth_failed without raw body", () => {
    const err = safeErrorFromHttpStatus("openrouter", 401, 'Bearer sk-or-v1-LEAKED_SECRET_TOKEN');
    expect(err.code).toBe("auth_failed");
    expect(err.message).not.toContain("LEAKED");
    expect(err.retryable).toBe(false);
  });

  it("never retries 401/403/invalid_api_key", () => {
    const policy = new ModelRetryPolicy(3);
    const auth = new SafeProviderError("auth_failed", "openrouter authentication failed", {
      httpStatus: 401,
      retryable: false,
    });
    const d0 = policy.decide(auth, 0);
    expect(d0.retrySameModel).toBe(false);
    expect(d0.switchModel).toBe(false);
    expect(isNeverRetryAuthError(auth)).toBe(true);
  });

  it("retries 429/5xx limited times", () => {
    const policy = new ModelRetryPolicy(3);
    const rate = safeErrorFromHttpStatus("openrouter", 429);
    expect(policy.decide(rate, 0).retrySameModel).toBe(true);
    expect(policy.decide(rate, 2).retrySameModel).toBe(false);
  });

  it("redacts tokens from UI error messages", () => {
    const msg = safeErrorMessageForUi(new Error("failed Bearer sk-or-v1-ABCDEFGHIJKLMNOP"));
    expect(msg).not.toMatch(/ABCDEFGHIJKLMNOP/);
    expect(redactSensitiveText("Authorization: Bearer sk-test-SECRET123456")).not.toContain("SECRET123456");
  });
});

describe("Lot C5.2 — IPC trust helper", () => {
  it("rejects untrusted sender", () => {
    const event = {
      sender: {
        isDestroyed: () => false,
        getURL: () => "https://evil.example/",
        mainFrame: { parent: null, url: "https://evil.example/" },
      },
      senderFrame: { parent: null, url: "https://evil.example/" },
    };
    expect(() => assertTrustedSender(event as never)).toThrow(/Untrusted IPC sender/);
  });
});

describe("Lot C5.3 — provider registry + Ollama", () => {
  it("rejects arbitrary host for openrouter", () => {
    const r = assertProviderRequestUrl("openrouter", "https://evil.example/v1/chat");
    expect(r.ok).toBe(false);
  });

  it("allows openrouter.ai https", () => {
    const r = assertProviderRequestUrl("openrouter", "https://openrouter.ai/api/v1/chat/completions");
    expect(r.ok).toBe(true);
  });

  it("rejects Ollama localhost hostname and private LAN", () => {
    expect(assertOllamaBaseUrl("http://localhost:11434/api/chat").ok).toBe(false);
    expect(assertOllamaBaseUrl("http://192.168.1.5:11434/api/chat").ok).toBe(false);
    expect(assertOllamaBaseUrl("https://127.0.0.1:11434/api/chat").ok).toBe(false);
  });

  it("allows Ollama 127.0.0.1 and ::1 only", () => {
    expect(assertOllamaBaseUrl("http://127.0.0.1:11434/api/chat").ok).toBe(true);
    expect(assertOllamaBaseUrl("http://[::1]:11434/api/chat").ok).toBe(true);
  });
});

describe("Lot C5.4 — rate limiting", () => {
  beforeEach(() => resetAiRateLimitsForTests());

  it("allows N starts then rejects; abort always ok", () => {
    for (let i = 0; i < 8; i++) {
      expect(consumeAiRateLimit("stream_start", 1, "/ws").ok).toBe(true);
    }
    const blocked = consumeAiRateLimit("stream_start", 1, "/ws");
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe("rate_limited_local");
    expect(allowAiAbort().ok).toBe(true);
  });

  it("resume bucket is separate", () => {
    for (let i = 0; i < 8; i++) consumeAiRateLimit("stream_start", 2, "/ws");
    expect(consumeAiRateLimit("resume", 2, "/ws").ok).toBe(true);
  });
});

describe("Lot C5.5 — BYOK format (no auto network)", () => {
  it("rejects invalid OpenRouter format at save validation", () => {
    expect(validateSecretFormat("OPENROUTER_API_KEY", "short").ok).toBe(false);
    expect(validateSecretFormat("OPENROUTER_API_KEY", "sk-or-v1-abcdefghijklmnopqrstuv").ok).toBe(true);
  });

  it("rejects bad Ollama base URL formats", () => {
    expect(validateSecretsPatchFormats({ OLLAMA_BASE_URL: "http://localhost:11434" }).ok).toBe(false);
    expect(validateSecretsPatchFormats({ OLLAMA_BASE_URL: "http://127.0.0.1:11434/api/chat" }).ok).toBe(true);
  });
});

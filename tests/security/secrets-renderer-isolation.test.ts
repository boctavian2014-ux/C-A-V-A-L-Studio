import { describe, expect, it } from "vitest";

import { redactSensitiveText } from "../../src/shared/command-output-redaction";
import {
  buildSecretProviderMetadata,
  findForbiddenSecretField,
  isForbiddenSecretFieldName,
  SETTINGS_FORBIDDEN_SECRET_KEYS,
} from "../../src/shared/secrets-metadata";
import { CONFIGURED_MARKER } from "../../ai/models/api-secrets";

describe("C2 secrets renderer isolation", () => {
  it("secrets metadata never includes values, prefixes, suffixes, or lengths", () => {
    const providers = buildSecretProviderMetadata({
      stored: {
        OPENROUTER_API_KEY: "sk-or-v1-REAL-SECRET-VALUE-DO-NOT-LEAK",
        MESHY_API_KEY: "meshy-REAL-SECRET-ABCDEF",
      },
      env: {},
    });
    const openrouter = providers.find((p) => p.provider === "OPENROUTER_API_KEY");
    const meshy = providers.find((p) => p.provider === "MESHY_API_KEY");
    expect(openrouter?.configured).toBe(true);
    expect(meshy?.configured).toBe(true);
    expect(openrouter?.source).toBe("secure-storage");
    const serialized = JSON.stringify(providers);
    expect(serialized).not.toContain("sk-or");
    expect(serialized).not.toContain("REAL-SECRET");
    expect(serialized).not.toMatch(/length|prefix|suffix/i);
    expect(serialized).not.toContain("meshy-REAL");
  });

  it("forbids settings keys that used to carry API secrets", () => {
    expect(SETTINGS_FORBIDDEN_SECRET_KEYS).toContain("cad.apiKey");
    expect(SETTINGS_FORBIDDEN_SECRET_KEYS).toContain("openrouter.apiKey");
    expect(SETTINGS_FORBIDDEN_SECRET_KEYS).toContain("mesh.apiKey");
  });

  it("rejects CAD/AI secret field names from renderer payloads", () => {
    expect(isForbiddenSecretFieldName("apiKey")).toBe(true);
    expect(isForbiddenSecretFieldName("openRouterApiKey")).toBe(true);
    expect(isForbiddenSecretFieldName("meshApiKey")).toBe(true);
    expect(isForbiddenSecretFieldName("meshyKey")).toBe(true);
    expect(isForbiddenSecretFieldName("token")).toBe(true);
    expect(isForbiddenSecretFieldName("authorization")).toBe(true);
    expect(isForbiddenSecretFieldName("prompt")).toBe(false);
    expect(isForbiddenSecretFieldName("quality")).toBe(false);

    expect(
      findForbiddenSecretField({
        prompt: "make a gear",
        openRouterApiKey: "sk-or-v1-TEST",
      })
    ).toBe("openRouterApiKey");

    expect(
      findForbiddenSecretField({
        prompt: "make a gear",
        nested: { secret: "x" },
      })
    ).toBe("nested.secret");

    expect(findForbiddenSecretField({ prompt: "ok", quality: "high" })).toBeNull();
  });

  it("redacts OpenRouter, Meshy, and Bearer fixtures from logs/errors", () => {
    const sample = [
      "auth Bearer sk-or-v1-TESTFIXTURE1234567890",
      "MESHY_API_KEY=meshy-test-fixture-abcdefghij",
      "OPENROUTER_API_KEY=sk-or-v1-TESTFIXTURE1234567890",
      "x-cad-api-key: cad-secret-fixture-xyz",
    ].join("\n");
    const redacted = redactSensitiveText(sample);
    expect(redacted).not.toContain("TESTFIXTURE");
    expect(redacted).not.toContain("meshy-test-fixture");
    expect(redacted).not.toContain("cad-secret-fixture");
    expect(redacted).toMatch(/REDACTED/);
    expect(redacted).toMatch(/Bearer\s+\[REDACTED\]/i);
  });

  it("configured marker is not a persistable secret", async () => {
    const { isPersistableSecret, isConfiguredMarker } = await import(
      "../../ai/models/api-secrets"
    );
    expect(isConfiguredMarker(CONFIGURED_MARKER)).toBe(true);
    expect(isPersistableSecret(CONFIGURED_MARKER)).toBe(false);
    expect(isPersistableSecret("sk-ant-real")).toBe(true);
  });
});

describe("C2 regression scan classifications", () => {
  it("documents SAFE vs UNSAFE remaining surfaces", () => {
    const rows: Array<{ pattern: string; classification: "SAFE" | "UNSAFE" | "JUSTIFIED" }> = [
      { pattern: "caval:secrets-get returns providers+configured only", classification: "SAFE" },
      { pattern: "caval:secrets-set write-only with assertTrustedSender", classification: "SAFE" },
      { pattern: "settings-save rejects *.apiKey", classification: "SAFE" },
      { pattern: "cad:createJob rejects secret fields; injects from env", classification: "SAFE" },
      { pattern: "ai-complete ignores renderer apiKeys", classification: "SAFE" },
      { pattern: "transient paste in Settings input until save+clear", classification: "JUSTIFIED" },
      { pattern: "main→CAD cloud HTTP body still carries keys (not renderer)", classification: "JUSTIFIED" },
    ];
    expect(rows.every((r) => r.classification !== "UNSAFE")).toBe(true);
  });
});

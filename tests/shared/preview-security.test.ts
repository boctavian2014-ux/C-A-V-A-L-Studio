import { describe, expect, it } from "vitest";

import { mergeCavalConfig } from "../../ai/config/caval-config-shared";
import {
  assertAllowedPreviewOpenUrl,
  assertPreviewCwdInput,
  extractValidatedExpoUrl,
  isAllowedPreviewOpenUrl,
  isAllowedPreviewWindowUrl,
  isPreviewTargetConfigured,
  parsePreviewCommand,
  parsePreviewTarget,
  redactPreviewLogs,
  toPreviewProbeUrl,
} from "../../src/shared/preview-security";

describe("preview target and config validation", () => {
  it("accepts only web or mobile targets", () => {
    expect(parsePreviewTarget("web")).toBe("web");
    expect(parsePreviewTarget("mobile")).toBe("mobile");
    expect(() => parsePreviewTarget("desktop")).toThrow(/Invalid preview target/);
    expect(() => parsePreviewTarget({ target: "web" })).toThrow(/Invalid preview target/);
  });

  it("treats missing, disabled, or incomplete config as not configured", () => {
    expect(isPreviewTargetConfigured("web", undefined)).toBe(false);
    expect(isPreviewTargetConfigured("web", { enabled: false, command: "npm run dev", url: "http://127.0.0.1:5173" })).toBe(false);
    expect(isPreviewTargetConfigured("web", { enabled: true, command: "npm run dev" })).toBe(false);
    expect(isPreviewTargetConfigured("web", { enabled: true, command: "npm run dev", url: "http://127.0.0.1:5173" })).toBe(true);
    expect(isPreviewTargetConfigured("mobile", { enabled: true, command: "npx expo start" })).toBe(true);
  });

  it("parses allowlisted preview commands and rejects injection", () => {
    expect(parsePreviewCommand("npm run dev")).toEqual({ bin: "npm", args: ["run", "dev"] });
    expect(parsePreviewCommand("npx expo start")).toEqual({ bin: "npx", args: ["expo", "start"] });
    expect(() => parsePreviewCommand("npm run dev | calc")).toThrow(/forbidden/);
    expect(() => parsePreviewCommand("powershell -enc AAAA")).toThrow(/not allowed/);
    expect(() => parsePreviewCommand("npx -c \"rm -rf /\"")).toThrow();
    expect(() => parsePreviewCommand("node -e \"process.exit(0)\"")).toThrow();
  });

  it("merges optional preview config from caval.jsonc without injecting defaults", () => {
    const merged = mergeCavalConfig({
      preview: {
        web: {
          enabled: true,
          cwd: ".",
          command: "npm run dev",
          url: "http://localhost:5173",
          openMode: "external",
        },
      },
    });
    expect(merged.preview?.web?.command).toBe("npm run dev");
    expect(mergeCavalConfig({}).preview).toBeUndefined();
  });
});

describe("preview URL allowlist", () => {
  it("allows loopback http(s) for web and rejects other schemes or hosts", () => {
    expect(assertAllowedPreviewOpenUrl("http://localhost:5173", "web")).toContain("localhost");
    expect(assertAllowedPreviewOpenUrl("http://127.0.0.1:5173", "web")).toContain("127.0.0.1");
    expect(assertAllowedPreviewOpenUrl("http://[::1]:5173", "web")).toContain("::1");
    expect(assertAllowedPreviewOpenUrl("https://localhost", "web")).toContain("https:");
    expect(assertAllowedPreviewOpenUrl("http://0.0.0.0:5173", "web")).toContain("127.0.0.1");
    expect(isAllowedPreviewOpenUrl("http://evil.example:5173", "web")).toBe(false);
    expect(isAllowedPreviewOpenUrl("file:///etc/passwd", "web")).toBe(false);
    expect(isAllowedPreviewOpenUrl("data:text/html,hi", "web")).toBe(false);
    expect(isAllowedPreviewOpenUrl("javascript:alert(1)", "web")).toBe(false);
    expect(isAllowedPreviewOpenUrl("exp://127.0.0.1:8081", "web")).toBe(false);
    expect(isAllowedPreviewWindowUrl("http://127.0.0.1:5173")).toBe(true);
    expect(isAllowedPreviewWindowUrl("https://example.com")).toBe(false);
  });

  it("allows validated Expo and local mobile URLs only", () => {
    expect(isAllowedPreviewOpenUrl("exp://127.0.0.1:8081", "mobile")).toBe(true);
    expect(isAllowedPreviewOpenUrl("exp://192.168.1.20:8081", "mobile")).toBe(true);
    expect(isAllowedPreviewOpenUrl("http://127.0.0.1:8081", "mobile")).toBe(true);
    expect(isAllowedPreviewOpenUrl("exp://8.8.8.8:8081", "mobile")).toBe(false);
    expect(isAllowedPreviewOpenUrl("file:///tmp", "mobile")).toBe(false);
    expect(isAllowedPreviewOpenUrl("javascript:alert(1)", "mobile")).toBe(false);
    expect(toPreviewProbeUrl("exp://127.0.0.1:8081", "mobile")).toBe("http://127.0.0.1:8081/status");
    expect(extractValidatedExpoUrl("Metro waiting on exp://127.0.0.1:8081")).toBe("exp://127.0.0.1:8081");
    expect(extractValidatedExpoUrl("open file:///etc/passwd")).toBeUndefined();
  });
});

describe("preview cwd input", () => {
  it("rejects UNC, protocols, and null bytes before sandboxing", () => {
    expect(assertPreviewCwdInput(".")).toBe(".");
    expect(assertPreviewCwdInput("mobile-app")).toBe("mobile-app");
    expect(() => assertPreviewCwdInput("\\\\127.0.0.1\\c$")).toThrow(/not allowed/);
    expect(() => assertPreviewCwdInput("//server/share")).toThrow(/not allowed/);
    expect(() => assertPreviewCwdInput("file:///C:/windows")).toThrow(/not allowed/);
    expect(() => assertPreviewCwdInput("data:text/plain,x")).toThrow(/not allowed/);
    expect(() => assertPreviewCwdInput("javascript:alert(1)")).toThrow(/not allowed/);
    expect(() => assertPreviewCwdInput("ok\0secret")).toThrow(/not allowed/);
  });
});

describe("preview log redaction", () => {
  it("redacts provider keys, GitHub tokens, and bearer JWTs", () => {
    const raw = [
      "token sk-or-v1-abcdefghijklmnopqrstuvwxyz012345",
      'openRouterApiKey: "sk-live-should-hide"',
      "meshApiKey=mesh_live_secret_value",
      'piapiApiKey="piapi-secret-value"',
      "ghp_livegithubtokenvalue1234567890",
      "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig",
    ].join("\n");
    const redacted = redactPreviewLogs(raw);
    expect(redacted).not.toContain("sk-or-v1-abcdefghijklmnopqrstuvwxyz012345");
    expect(redacted).not.toContain("sk-live-should-hide");
    expect(redacted).not.toContain("mesh_live_secret_value");
    expect(redacted).not.toContain("piapi-secret-value");
    expect(redacted).not.toContain("ghp_livegithubtokenvalue1234567890");
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(redacted).toMatch(/REDACTED/);
  });
});

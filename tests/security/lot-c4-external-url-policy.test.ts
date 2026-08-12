import { describe, expect, it, vi } from "vitest";

import { assertTrustedSender } from "../../src/main/ipc-trust";
import {
  CAVALLO_TRUSTED_HOSTS,
  evaluateExternalUrl,
  isAllowedWorkbenchNavigation,
  isDisallowedHostname,
  openExternalUrl,
  parseExternalUrl,
  redactUrlForDisplay,
  STRIPE_CHECKOUT_HOSTS,
} from "../../src/main/external-url-policy";

describe("Lot C4 external-url-policy", () => {
  describe("parseExternalUrl / schemes", () => {
    it("rejects dangerous schemes and external http", () => {
      expect(parseExternalUrl("javascript:alert(1)").ok).toBe(false);
      expect(parseExternalUrl("data:text/html,x").ok).toBe(false);
      expect(parseExternalUrl("file:///etc/passwd").ok).toBe(false);
      expect(parseExternalUrl("ftp://files.example.com/a").ok).toBe(false);
      expect(parseExternalUrl("vbscript:msgbox").ok).toBe(false);
      expect(parseExternalUrl("blob:https://x").ok).toBe(false);
      expect(parseExternalUrl("http://evil.com", { isProduction: true }).ok).toBe(false);
      expect(parseExternalUrl("http://evil.com", { isProduction: false }).ok).toBe(false);
    });

    it("allows https and localhost http only in development", () => {
      expect(parseExternalUrl("https://caval.studio/docs").ok).toBe(true);
      expect(parseExternalUrl("http://localhost:8791/health", { isProduction: false }).ok).toBe(true);
      expect(parseExternalUrl("http://127.0.0.1:3000", { isProduction: false }).ok).toBe(true);
      expect(parseExternalUrl("http://localhost:8791/health", { isProduction: true }).ok).toBe(false);
    });

    it("rejects credentials and punycode/IDN", () => {
      expect(parseExternalUrl("https://user:pass@evil.com/x").ok).toBe(false);
      expect(parseExternalUrl("https://xn--e1aybc.example/path").ok).toBe(false);
      expect(isDisallowedHostname("xn--fiqs8s")).toBe(true);
      expect(isDisallowedHostname("münchen.de")).toBe(true);
    });
  });

  describe("origin policy", () => {
    it("INTERNAL_CONSTANT allowlisted → allow", () => {
      const e = evaluateExternalUrl("https://caval.studio", "INTERNAL_CONSTANT", {
        allowedHosts: CAVALLO_TRUSTED_HOSTS,
        isProduction: true,
      });
      expect(e.decision).toBe("allow");
    });

    it("Stripe + USER_INITIATED_TRUSTED → allow", () => {
      const e = evaluateExternalUrl(
        "https://checkout.stripe.com/c/pay/cs_test",
        "USER_INITIATED_TRUSTED",
        { allowedHosts: STRIPE_CHECKOUT_HOSTS, isProduction: true }
      );
      expect(e.decision).toBe("allow");
    });

    it("allowlisted host from mock AI (EXTERNAL_CONTENT) → confirm, never auto-open", () => {
      const e = evaluateExternalUrl("https://caval.studio/docs", "EXTERNAL_CONTENT", {
        allowedHosts: CAVALLO_TRUSTED_HOSTS,
        isProduction: true,
      });
      expect(e.decision).toBe("confirm");
      expect(e.allowlisted).toBe(true);
    });

    it("unknown host → confirm", () => {
      const e = evaluateExternalUrl("https://phish.example/login", "EXTERNAL_CONTENT", {
        isProduction: true,
      });
      expect(e.decision).toBe("confirm");
      expect(e.allowlisted).toBe(false);
    });
  });

  describe("openExternalUrl", () => {
    it("cancel on unknown host does not call shell.openExternal", async () => {
      const openExternal = vi.fn(async () => undefined);
      const result = await openExternalUrl("https://phish.example/x", {
        origin: "EXTERNAL_CONTENT",
        isProduction: true,
        confirm: async () => false,
        openExternal,
      });
      expect(result.ok).toBe(false);
      expect(result.opened).toBe(false);
      expect(openExternal).not.toHaveBeenCalled();
    });

    it("confirm on unknown host calls openExternal exactly once with real URL", async () => {
      const openExternal = vi.fn(async () => undefined);
      const url = "https://phish.example/path?token=secret-value";
      const result = await openExternalUrl(url, {
        origin: "EXTERNAL_CONTENT",
        isProduction: true,
        confirm: async (info) => {
          expect(info.displayUrl).toContain("[REDACTED]");
          expect(info.displayUrl).not.toContain("secret-value");
          expect(info.hostname).toBe("phish.example");
          return true;
        },
        openExternal,
      });
      expect(result.ok).toBe(true);
      expect(openExternal).toHaveBeenCalledTimes(1);
      expect(openExternal).toHaveBeenCalledWith(url);
    });

    it("AI allowlisted URL still requires confirm before open", async () => {
      const openExternal = vi.fn(async () => undefined);
      await openExternalUrl("https://caval.studio", {
        origin: "EXTERNAL_CONTENT",
        allowedHosts: CAVALLO_TRUSTED_HOSTS,
        isProduction: true,
        confirm: async () => true,
        openExternal,
      });
      expect(openExternal).toHaveBeenCalledTimes(1);

      openExternal.mockClear();
      const denied = await openExternalUrl("https://caval.studio", {
        origin: "EXTERNAL_CONTENT",
        allowedHosts: CAVALLO_TRUSTED_HOSTS,
        isProduction: true,
        confirm: async () => false,
        openExternal,
      });
      expect(denied.opened).toBe(false);
      expect(openExternal).not.toHaveBeenCalled();
    });

    it("INTERNAL_CONSTANT opens without confirm", async () => {
      const openExternal = vi.fn(async () => undefined);
      const confirm = vi.fn(async () => true);
      await openExternalUrl("https://caval.studio", {
        origin: "INTERNAL_CONSTANT",
        allowedHosts: CAVALLO_TRUSTED_HOSTS,
        isProduction: true,
        confirm,
        openExternal,
      });
      expect(confirm).not.toHaveBeenCalled();
      expect(openExternal).toHaveBeenCalledTimes(1);
    });

    it("rejects credentials before open", async () => {
      const openExternal = vi.fn(async () => undefined);
      const result = await openExternalUrl("https://user:pass@evil.com/", {
        origin: "EXTERNAL_CONTENT",
        isProduction: true,
        confirm: async () => true,
        openExternal,
      });
      expect(result.ok).toBe(false);
      expect(openExternal).not.toHaveBeenCalled();
    });
  });

  describe("redaction", () => {
    it("redacts sensitive query params in display/log form", () => {
      const display = redactUrlForDisplay(
        "https://example.com/cb?token=abc&code=1&state=xyz&api_key=k&client_secret=s&session_id=sid&safe=ok"
      );
      expect(display).toContain("safe=ok");
      expect(display).toContain("[REDACTED]");
      expect(display).not.toContain("token=abc");
      expect(display).not.toContain("client_secret=s");
    });
  });

  describe("will-navigate / window.open policy helpers", () => {
    it("allows file/app/caval and blocks external https navigation", () => {
      expect(isAllowedWorkbenchNavigation("file:///C:/app/index.html")).toBe(true);
      expect(isAllowedWorkbenchNavigation("app://./index.html")).toBe(true);
      expect(isAllowedWorkbenchNavigation("caval://workspace")).toBe(true);
      expect(isAllowedWorkbenchNavigation("https://evil.com")).toBe(false);
      expect(isAllowedWorkbenchNavigation("http://example.com")).toBe(false);
    });

    it("setWindowOpenHandler contract: always deny (no auto openExternal)", () => {
      const openExternal = vi.fn(async () => undefined);
      const e = evaluateExternalUrl("https://anything.example", "EXTERNAL_CONTENT", {
        isProduction: true,
      });
      expect(e.decision).toBe("confirm");
      expect(openExternal).not.toHaveBeenCalled();
    });
  });

  describe("IPC trust (shared with engineering:openExternal / billing-checkout)", () => {
    it("untrusted sender is rejected", () => {
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
});

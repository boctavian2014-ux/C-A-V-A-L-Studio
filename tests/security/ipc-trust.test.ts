import { describe, expect, it } from "vitest";

import { isSafeExternalUrl, STRIPE_CHECKOUT_HOSTS } from "../../src/main/ipc-trust";

describe("ipc-trust", () => {
  describe("isSafeExternalUrl", () => {
    it("allows https URLs by default", () => {
      expect(isSafeExternalUrl("https://example.com/path")).toBe(true);
      expect(isSafeExternalUrl("http://localhost:8791/health")).toBe(true);
    });

    it("blocks dangerous protocols", () => {
      expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
      expect(isSafeExternalUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    });

    it("rejects malformed URLs", () => {
      expect(isSafeExternalUrl("not-a-url")).toBe(false);
      expect(isSafeExternalUrl("")).toBe(false);
    });

    it("enforces host allowlist when provided", () => {
      expect(isSafeExternalUrl("https://checkout.stripe.com/c/pay/cs_test", STRIPE_CHECKOUT_HOSTS)).toBe(
        true
      );
      expect(isSafeExternalUrl("https://evil.attacker.com/checkout.stripe.com", STRIPE_CHECKOUT_HOSTS)).toBe(
        false
      );
      expect(isSafeExternalUrl("https://example.com", STRIPE_CHECKOUT_HOSTS)).toBe(false);
    });
  });
});

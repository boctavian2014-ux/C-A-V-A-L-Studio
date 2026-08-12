import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  decryptProfileSecret,
  encryptProfileSecret,
} from "../../engineering/cad-server/crypto/profile-secret";
import { redactSensitiveText } from "../../src/shared/command-output-redaction";
import { cadLog } from "../../engineering/cad-server/middleware/logger";
import { assertCadProductionSafety } from "../../engineering/cad-server/boot-guard";

const KEY = randomBytes(32).toString("hex");
const KEY_V1 = randomBytes(32).toString("hex");
const KEY_V2 = randomBytes(32).toString("hex");

describe("provider profile AES-256-GCM", () => {
  afterEach(() => {
    delete process.env.CAD_PROFILE_ENCRYPTION_KEY;
    delete process.env.CAD_PROFILE_ENCRYPTION_KEY_VERSION;
    delete process.env.CAD_PROFILE_ENCRYPTION_KEY_V1;
  });

  it("round-trips with a unique nonce per encryption", () => {
    process.env.CAD_PROFILE_ENCRYPTION_KEY = KEY;
    process.env.CAD_PROFILE_ENCRYPTION_KEY_VERSION = "1";
    const a = encryptProfileSecret("sk-or-v1-abcdefghijklmnopqrstuv");
    const b = encryptProfileSecret("sk-or-v1-abcdefghijklmnopqrstuv");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.authTag).toBeTruthy();
    expect(decryptProfileSecret(a)).toBe("sk-or-v1-abcdefghijklmnopqrstuv");
    expect(decryptProfileSecret(b)).toBe("sk-or-v1-abcdefghijklmnopqrstuv");
  });

  it("decrypts a v1 profile after the server current version becomes v2 when V1 key is kept", () => {
    process.env.CAD_PROFILE_ENCRYPTION_KEY = KEY_V1;
    process.env.CAD_PROFILE_ENCRYPTION_KEY_VERSION = "1";
    const stored = encryptProfileSecret("sk-or-v1-abcdefghijklmnopqrstuv");
    expect(stored.keyVersion).toBe(1);

    process.env.CAD_PROFILE_ENCRYPTION_KEY = KEY_V2;
    process.env.CAD_PROFILE_ENCRYPTION_KEY_VERSION = "2";
    process.env.CAD_PROFILE_ENCRYPTION_KEY_V1 = KEY_V1;

    expect(decryptProfileSecret(stored)).toBe("sk-or-v1-abcdefghijklmnopqrstuv");
    const next = encryptProfileSecret("sk-or-v1-abcdefghijklmnopqrstuv");
    expect(next.keyVersion).toBe(2);
    expect(decryptProfileSecret(next)).toBe("sk-or-v1-abcdefghijklmnopqrstuv");
  });

  it("fails closed if the previous version key is missing after a bump", () => {
    process.env.CAD_PROFILE_ENCRYPTION_KEY = KEY_V1;
    process.env.CAD_PROFILE_ENCRYPTION_KEY_VERSION = "1";
    const stored = encryptProfileSecret("sk-or-v1-abcdefghijklmnopqrstuv");
    process.env.CAD_PROFILE_ENCRYPTION_KEY = KEY_V2;
    process.env.CAD_PROFILE_ENCRYPTION_KEY_VERSION = "2";
    delete process.env.CAD_PROFILE_ENCRYPTION_KEY_V1;
    expect(() => decryptProfileSecret(stored)).toThrow(/CAD_PROFILE_ENCRYPTION_KEY_V1/);
  });
});

describe("CAD production anonymous boot guard", () => {
  const prevNodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    delete process.env.CAD_ALLOW_ANONYMOUS;
    delete process.env.CAD_USE_LOCAL;
  });

  it("fails fast in production when CAD_ALLOW_ANONYMOUS=1", () => {
    process.env.NODE_ENV = "production";
    process.env.CAD_ALLOW_ANONYMOUS = "1";
    delete process.env.CAD_USE_LOCAL;
    expect(() => assertCadProductionSafety()).toThrow(/CAD_ALLOW_ANONYMOUS=1 is forbidden/i);
  });

  it("allows anonymous on local CAD even if NODE_ENV is production", () => {
    process.env.NODE_ENV = "production";
    process.env.CAD_ALLOW_ANONYMOUS = "1";
    process.env.CAD_USE_LOCAL = "1";
    expect(() => assertCadProductionSafety()).not.toThrow();
  });
});

describe("CAD log redaction fixtures", () => {
  it("redacts Bearer, sk-, ghp_, and key fields before emit", () => {
    const fixture =
      'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig sk-or-v1-LIVESECRETVALUEHERE ghp_livegithubtokenvalue1234567890 "openRouterApiKey":"sk-or-v1-LIVESECRETVALUEHERE"';
    const lines: string[] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      cadLog({
        level: "info",
        event: "fixture",
        message: fixture,
        meta: { openRouterApiKey: "sk-or-v1-LIVESECRETVALUEHERE" },
      });
    } finally {
      console.info = original;
    }
    const joined = lines.join("\n");
    expect(joined).not.toContain("LIVESECRETVALUEHERE");
    expect(joined).not.toContain("livegithubtokenvalue");
    expect(joined).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(redactSensitiveText(fixture)).toMatch(/REDACTED/);
    expect(redactSensitiveText(fixture)).not.toContain("ghp_livegithubtokenvalue");
  });
});

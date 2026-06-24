import { describe, expect, it } from "vitest";
import { validateExtensionManifest } from "../../marketplace/extensions/manifest-validator";

describe("validateExtensionManifest", () => {
  it("accepts valid caval manifest", () => {
    const result = validateExtensionManifest({
      name: "romania-tools",
      publisher: "caval",
      version: "1.0.0",
      description: "Romania tooling",
      engines: { caval: "^0.1.0" }
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects manifest without engines", () => {
    const result = validateExtensionManifest({
      name: "bad-ext",
      publisher: "x",
      version: "1.0.0"
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("engines"))).toBe(true);
  });

  it("rejects invalid semver", () => {
    const result = validateExtensionManifest({
      name: "bad-version",
      publisher: "x",
      version: "not-semver",
      engines: { vscode: "^1.0.0" }
    });
    expect(result.valid).toBe(false);
  });
});

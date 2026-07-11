import { describe, expect, it } from "vitest";
import { CavalExtensionHost } from "../../src/extensions/extension-host";

describe("CavalExtensionHost", () => {
  it("registers and lists extension manifests", () => {
    const host = new CavalExtensionHost();
    host.register({ id: "theme-dark", name: "Dark Theme", version: "1.0.0", engines: {} });
    expect(host.list()).toHaveLength(1);
    expect(host.list()[0].id).toBe("theme-dark");
  });
});

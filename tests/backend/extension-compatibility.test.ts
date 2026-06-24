import { describe, expect, it } from "vitest";
import { ExtensionCompatibility } from "../../marketplace/extensions/compatibility";

describe("ExtensionCompatibility", () => {
  const compatibility = new ExtensionCompatibility();

  it("detects vscode extensions and adds caval engine", () => {
    const report = compatibility.analyze({
      name: "vscode-ext",
      publisher: "dev",
      version: "1.0.0",
      engines: { vscode: "^1.85.0" }
    });
    expect(report.source).toBe("vscode");
    expect(report.compatible).toBe(true);
    expect(report.convertedManifest.engines.caval).toBe("^0.1.0");
  });

  it("marks unknown engine manifests incompatible", () => {
    const report = compatibility.analyze({
      name: "unknown",
      publisher: "dev",
      version: "1.0.0",
      engines: {}
    });
    expect(report.compatible).toBe(false);
    expect(report.source).toBe("unknown");
  });
});

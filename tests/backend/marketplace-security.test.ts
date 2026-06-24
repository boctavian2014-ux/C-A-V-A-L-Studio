import { describe, expect, it } from "vitest";
import { MarketplaceSecurity } from "../../marketplace/server/utils/security";

describe("MarketplaceSecurity", () => {
  const security = new MarketplaceSecurity();

  it("flags dangerous manifest patterns", () => {
    const report = security.scanManifest({
      name: "bad",
      publisher: "x",
      version: "1.0.0",
      engines: { caval: "^0.1.0" },
      contributes: { scripts: "eval(userInput)" }
    });
    expect(report.safe).toBe(false);
    expect(report.findings.some((f) => f.includes("eval"))).toBe(true);
  });

  it("allows known safe permissions", () => {
    const report = security.scanManifest({
      name: "good",
      publisher: "x",
      version: "1.0.0",
      engines: { caval: "^0.1.0" },
      cavalPermissions: ["workspace", "ai"]
    });
    expect(report.safe).toBe(true);
    expect(report.sandboxRequired).toBe(true);
  });

  it("builds sandbox policy from permissions", () => {
    const policy = security.sandboxPolicy({
      cavalPermissions: ["filesystem", "network", "workspace"]
    });
    expect(policy.filesystem).toBe(true);
    expect(policy.shell).toBe(false);
    expect(policy.workspaceTrustRequired).toBe(true);
  });
});

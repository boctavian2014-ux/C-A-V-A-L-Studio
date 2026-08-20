import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PreviewPanel } from "../../../../src/renderer/components/sidebar/PreviewPanel";

describe("sidebar preview mount", () => {
  it("exports PreviewPanel", () => {
    expect(typeof PreviewPanel).toBe("function");
  });

  it("mounts PreviewPanel and does not reference the legacy launcher", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../../../src/renderer/components/sidebar/FileTree.tsx"),
      "utf8"
    );
    expect(source).toContain("from './PreviewPanel'");
    expect(source).toContain("<PreviewPanel");
    expect(source).not.toContain("PreviewLauncherPanel");
    expect(source).not.toContain("PreviewLauncher");
  });

  it("PreviewPanel imports WEB/MOBILE SIDEBAR icons", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../../../src/renderer/components/sidebar/PreviewPanel.tsx"),
      "utf8"
    );
    expect(source).toContain("WEB SIDEBAR.jpg");
    expect(source).toContain("MOBILE SIDEBAR.jpg");
    expect(source).toContain("usePreviewStore");
  });
});

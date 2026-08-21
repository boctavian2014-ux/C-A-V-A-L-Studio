import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PreviewContentPanel } from "../../../../src/renderer/components/preview/PreviewContentPanel";

describe("sidebar preview mount (rail migration)", () => {
  it("exports PreviewContentPanel", () => {
    expect(typeof PreviewContentPanel).toBe("function");
  });

  it("FileTree no longer mounts PreviewPanel", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../../../src/renderer/components/sidebar/FileTree.tsx"),
      "utf8"
    );
    expect(source).not.toContain("from './PreviewPanel'");
    expect(source).not.toContain("<PreviewPanel");
    expect(source).not.toContain("PreviewLauncherPanel");
  });

  it("ActivityBar imports WEB/MOBILE SIDEBAR icons", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../../../src/renderer/components/sidebar/ActivityBar.tsx"),
      "utf8"
    );
    expect(source).toContain("WEB SIDEBAR.jpg");
    expect(source).toContain("MOBILE SIDEBAR.jpg");
    expect(source).toContain("usePreviewStore");
  });
});

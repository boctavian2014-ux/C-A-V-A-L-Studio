import { describe, expect, it } from "vitest";
import {
  clampPrintSettings,
  formatPrintSettingsMarkdown,
} from "../../src/shared/cad-zoo-contract";
import { LEGACY_CAD_SECRET_FIELDS } from "../../engineering/cad-server/legacy-contract";

describe("cad-zoo-contract", () => {
  it("clamps print settings into safe FDM ranges", () => {
    expect(clampPrintSettings({ layerHeight: 2, infill: 999, material: "PLA" })).toEqual({
      layerHeight: 0.4,
      infill: 100,
      supports: true,
      material: "PLA",
    });
  });

  it("formats G-CODE markdown for CAD & Print tab", () => {
    const md = formatPrintSettingsMarkdown(
      { layerHeight: 0.2, infill: 20, supports: true, material: "PETG" },
      "en"
    );
    expect(md).toContain("## G-CODE SETTINGS");
    expect(md).toContain("PETG");
  });

  it("includes zooApiToken in legacy secret strip list (main-only attach)", () => {
    expect(LEGACY_CAD_SECRET_FIELDS).toContain("zooApiToken");
  });
});

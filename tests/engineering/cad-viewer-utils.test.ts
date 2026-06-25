import { describe, expect, it } from "vitest";
import { dimensionsFromBox3 } from "../../src/renderer/components/engineering/cad-viewer-utils";

describe("dimensionsFromBox3", () => {
  it("formats bounding box size in mm", () => {
    const dims = dimensionsFromBox3({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 80, y: 25, z: 80 },
    });
    expect(dims.widthMm).toBe(80);
    expect(dims.heightMm).toBe(25);
    expect(dims.depthMm).toBe(80);
    expect(dims.label).toBe("80 × 25 × 80 mm");
  });

  it("rounds to one decimal", () => {
    const dims = dimensionsFromBox3({
      min: { x: -10.04, y: 0, z: 0 },
      max: { x: 10.06, y: 12.34, z: 5.01 },
    });
    expect(dims.widthMm).toBe(20.1);
    expect(dims.heightMm).toBe(12.3);
    expect(dims.depthMm).toBe(5);
    expect(dims.label).toBe("20.1 × 12.3 × 5 mm");
  });
});

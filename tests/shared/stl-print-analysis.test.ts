import { describe, expect, it } from "vitest";
import {
  analyzeStlBuffer,
  analyzeStlForPrint,
  buildCubeStlBuffer,
  generatePrintSuggestions,
  type StlAnalysis,
} from "../../src/shared/stl-print-analysis";

function withFeatures(partial: Partial<StlAnalysis["features"]>): StlAnalysis {
  return {
    volumeMm3: 1000,
    surfaceAreaMm2: 600,
    boundingBox: { x: 20, y: 20, z: 40 },
    triangleCount: 12,
    printabilityScore: 70,
    features: {
      hasOverhangs: false,
      maxOverhangAngleDeg: 10,
      hasBridges: false,
      maxBridgeLengthMm: 0,
      hasThinWalls: false,
      minWallThicknessMm: 3,
      hasFlatBase: true,
      flatBaseAreaMm2: 200,
      curvedSurfacesPercent: 5,
      ...partial,
    },
  };
}

describe("StlAnalyzer (shared CPU)", () => {
  it("parses binary cube STL and reports volume / triangle count", () => {
    const buffer = buildCubeStlBuffer(10);
    const result = analyzeStlBuffer(buffer);
    expect(result.triangleCount).toBe(12);
    expect(result.volumeMm3).toBeCloseTo(1000, 0);
    expect(result.boundingBox.x).toBeCloseTo(10, 0);
    expect(result.features.hasFlatBase).toBe(true);
  });

  it("returns print suggestions from analyzeStlForPrint", () => {
    const { analysis, suggestions } = analyzeStlForPrint(buildCubeStlBuffer(10));
    expect(analysis.printabilityScore).toBeGreaterThan(50);
    expect(suggestions.layerHeight.recommended).toBeGreaterThan(0);
    expect(suggestions.infill.density).toBeGreaterThan(0);
  });
});

describe("PrintOptimizer (shared CPU)", () => {
  it("suggests gyroid for curved / thin-wall parts", () => {
    const suggestions = generatePrintSuggestions(
      withFeatures({ curvedSurfacesPercent: 60, hasThinWalls: true })
    );
    expect(suggestions.infill.pattern).toBe("gyroid");
  });

  it("suggests tree supports for severe overhangs", () => {
    const suggestions = generatePrintSuggestions(
      withFeatures({
        hasOverhangs: true,
        maxOverhangAngleDeg: 65,
        hasFlatBase: false,
      })
    );
    expect(suggestions.supports.needed).toBe(true);
    expect(suggestions.supports.type).toBe("tree");
  });
});

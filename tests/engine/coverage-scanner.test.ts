import { describe, expect, it } from "vitest";

import { formatCoverageReport, scanProjectCoverage } from "./coverage-scanner";

describe("Full Test Coverage Engine scanner", () => {
  it("scans project and returns coverage metrics", () => {
    const result = scanProjectCoverage(process.cwd());
    expect(result.totalSourceFiles).toBeGreaterThan(50);
    expect(result.coveragePercent).toBeGreaterThan(0);
    expect(result.byCategory.ai).toBeDefined();
  });

  it("identifies known tested modules", () => {
    const result = scanProjectCoverage(process.cwd());
    const modelRouter = result.gaps.find((g) => g.sourceFile.includes("model-router.ts"));
    expect(modelRouter?.hasTest).toBe(true);
  });

  it("formats markdown report", () => {
    const result = scanProjectCoverage(process.cwd());
    const report = formatCoverageReport(result);
    expect(report).toContain("Full Test Coverage Engine Report");
    expect(report).toContain("By category");
  });
});

import { describe, expect, it } from "vitest";
import {
  componentsToCsv,
  buildEngineeringPrompt,
  extractComponentRows,
  parseEngineeringPlan,
  planToMarkdown,
  SECTION_ORDER,
} from "../../src/renderer/components/engineering/engineering-format";

describe("engineering-format", () => {
  it("builds a hardware prompt with constraints", () => {
    const prompt = buildEngineeringPrompt({
      prompt: "Dronă FPV 5 inch",
      projectType: "drone",
      constraints: {
        budget: "300 EUR",
        dimensions: "",
        voltage: "4S",
        autonomy: "8 min",
        weight: "",
        skillLevel: "beginner",
      },
    });

    expect(prompt).toContain("Engineering AI");
    expect(prompt).toContain("## REQUIREMENTS");
    expect(prompt).toContain("## BOM");
    expect(prompt).toContain("## PERFORMANCE");
    expect(prompt).toContain("## UPGRADES");
    expect(prompt).toContain("Dronă FPV 5 inch");
    expect(prompt).toContain("Budget: 300 EUR");
  });

  it("includes FPV-specific drone instructions", () => {
    const prompt = buildEngineeringPrompt({
      prompt: "Racing quad",
      projectType: "drone",
      constraints: {
        budget: "",
        dimensions: "",
        voltage: "",
        autonomy: "",
        weight: "",
        skillLevel: "beginner",
      },
    });

    expect(prompt).toContain("Betaflight");
    expect(prompt).toContain("ESC");
    expect(prompt).toContain("thrust-to-weight");
    expect(prompt).toContain("ELRS");
  });

  it("includes adapted instructions for robot type", () => {
    const prompt = buildEngineeringPrompt({
      prompt: "Robot cu senzori",
      projectType: "robot",
      constraints: {
        budget: "",
        dimensions: "",
        voltage: "",
        autonomy: "",
        weight: "",
        skillLevel: "intermediate",
      },
    });

    expect(prompt).toContain("motor driver");
    expect(prompt).toContain("## PERFORMANCE");
    expect(prompt).toContain("LiDAR");
  });

  it("parses markdown sections including performance and upgrades", () => {
    const md = [
      "## REQUIREMENTS",
      "Needs 4S power.",
      "## Lista componente",
      "| Name | Part/Code | Qty | Role | Notes |",
      "| --- | --- | --- | --- | --- |",
      "| FC | MATEKF405 | 1 | Control | FPV |",
      "## CIRCUIT",
      "Power -> ESC -> Motors",
      "## PERFORMANCE",
      "Thrust-to-weight 4:1",
      "## UPGRADES",
      "HDZero VTX",
    ].join("\n");

    const parsed = parseEngineeringPlan(md);
    expect(parsed.sections.requirements).toContain("4S power");
    expect(parsed.sections.circuit).toContain("Power -> ESC");
    expect(parsed.sections.performance).toContain("Thrust-to-weight");
    expect(parsed.sections.upgrades).toContain("HDZero");
    expect(parsed.componentRows).toHaveLength(1);
    expect(parsed.componentRows[0]?.name).toBe("FC");
  });

  it("still parses legacy ## BOM headings into component rows", () => {
    const md = [
      "## BOM",
      "| Name | Part/Code | Qty | Role | Notes |",
      "| --- | --- | --- | --- | --- |",
      "| ESC | BLHeli32 | 4 | Drive | 35A |",
    ].join("\n");

    const parsed = parseEngineeringPlan(md);
    expect(parsed.sections.bom).toContain("BLHeli32");
    expect(parsed.componentRows).toHaveLength(1);
    expect(parsed.componentRows[0]?.name).toBe("ESC");
  });

  it("exports component list to CSV", () => {
    const rows = extractComponentRows(
      "| Name | Part/Code | Qty | Role | Notes |\n| FC | X | 1 | Control | |"
    );
    const csv = componentsToCsv(rows);
    expect(csv).toContain("Name,Part/Code,Qty,Role,Notes");
    expect(csv).toContain('"FC"');
  });

  it("prioritizes user request over generic templates", () => {
    const prompt = buildEngineeringPrompt({
      prompt: "Roata 150mm cu hub M5 pentru robot",
      projectType: "drone",
      constraints: {
        budget: "",
        dimensions: "150mm",
        voltage: "",
        autonomy: "",
        weight: "",
        skillLevel: "beginner",
      },
    });

    const requestIdx = prompt.indexOf("=== USER REQUEST");
    const rulesIdx = prompt.indexOf("RULES:");
    expect(rulesIdx).toBeGreaterThan(-1);
    expect(requestIdx).toBeGreaterThan(rulesIdx);
    expect(prompt).toContain("Roata 150mm cu hub M5 pentru robot");
    expect(prompt).toContain("do NOT replace it with the reference build");
  });

  it("rebuilds markdown export with all 8 sections in order", () => {
    const md = [
      "## REQUIREMENTS",
      "Test req",
      "## Lista componente",
      "Item list",
      "## CIRCUIT",
      "Wiring",
      "## PCB",
      "Layout",
      "## ASSEMBLY",
      "Steps",
      "## TESTING",
      "Checks",
      "## PERFORMANCE",
      "Metrics",
      "## UPGRADES",
      "Options",
    ].join("\n");

    const parsed = parseEngineeringPlan(md);
    const exported = planToMarkdown(parsed, "Test Plan");

    expect(exported).toContain("# Test Plan");
    expect(exported).toContain("## REQUIREMENTS");
    expect(exported).toContain("## Lista componente");
    expect(exported).toContain("## UPGRADES");

    const reqIdx = exported.indexOf("## REQUIREMENTS");
    const perfIdx = exported.indexOf("## PERFORMANCE");
    const upgIdx = exported.indexOf("## UPGRADES");
    expect(reqIdx).toBeLessThan(perfIdx);
    expect(perfIdx).toBeLessThan(upgIdx);
    expect(SECTION_ORDER).toHaveLength(8);
  });
});

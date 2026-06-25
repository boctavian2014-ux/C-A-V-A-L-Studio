import { describe, expect, it } from "vitest";
import { buildCadPrompt, extractScadBlock } from "../../src/renderer/components/engineering/engineering-format";
import { stripScadFences, validateScadSource } from "../../engineering/cad-server/scad-prompt";

describe("buildCadPrompt", () => {
  it("includes prompt, project type, and constraints", () => {
    const text = buildCadPrompt({
      prompt: "Capac cilindric drone Ø80mm",
      projectType: "drone",
      constraints: {
        budget: "50 EUR",
        dimensions: "Ø80 x 25mm",
        voltage: "",
        autonomy: "",
        weight: "30g",
        skillLevel: "beginner",
      },
    });
    expect(text).toContain("Capac cilindric drone Ø80mm");
    expect(text).toContain("Dronă FPV");
    expect(text).toContain("Ø80 x 25mm");
    expect(text).toContain("30g");
    expect(text).not.toContain("drone cap Ø80mm");
  });

  it("includes plan sections when provided", () => {
    const text = buildCadPrompt({
      prompt: "Roata robot 100mm",
      projectType: "robot",
      constraints: { budget: "", dimensions: "100mm", voltage: "", autonomy: "", weight: "", skillLevel: "intermediate" },
      planSections: { requirements: "Must support 5kg payload", assembly: "Press-fit hub" },
    });
    expect(text).toContain("5kg payload");
    expect(text).toContain("Press-fit hub");
    expect(text).toContain("Roata robot");
  });
});

describe("extractScadBlock", () => {
  it("extracts openscad fenced block", () => {
    const md = "Some plan\n```openscad\ncube(10);\n```\nDone";
    expect(extractScadBlock(md)).toBe("cube(10);");
  });

  it("returns null when no block", () => {
    expect(extractScadBlock("no code here")).toBeNull();
  });
});

describe("scad-prompt helpers", () => {
  it("strips markdown fences", () => {
    expect(stripScadFences("```openscad\ncylinder(h=10);\n```")).toBe("cylinder(h=10);");
  });

  it("validates primitives", () => {
    const valid = `$fn=64;\nmodule part(){ cube(10); }\npart();`;
    expect(validateScadSource(valid).ok).toBe(true);
    expect(validateScadSource("hello world").ok).toBe(false);
  });
});

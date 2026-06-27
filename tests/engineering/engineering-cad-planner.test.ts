import { describe, expect, it } from "vitest";
import {
  buildClarifyCadMessage,
  planEngineeringCad,
} from "../../src/renderer/store/engineering-cad-planner";
import { inferProjectType } from "../../src/renderer/components/engineering/engineering-format";

describe("engineering-cad-planner", () => {
  it("infers drone project type from prompt", () => {
    expect(inferProjectType("vreau o drona fpv")).toBe("drone");
    expect(inferProjectType("5 inch frame plate")).toBe("drone");
  });

  it("clarifies vague full drone request", () => {
    const plan = planEngineeringCad({
      prompt: "vreau o drona",
      projectType: "custom",
    });
    expect(plan.action).toBe("clarify");
    expect(plan.projectType).toBe("drone");
    expect(plan.quickReplies?.length).toBeGreaterThan(0);
    expect(buildClarifyCadMessage(plan)).toContain("STL");
  });

  it("generates for specific drone part", () => {
    const plan = planEngineeringCad({
      prompt: "cadru 5 inch bottom plate gauri M3",
      projectType: "custom",
    });
    expect(plan.action).toBe("generate");
    expect(plan.projectType).toBe("drone");
    expect(plan.technicalPrompt).toContain("cadru");
  });
});

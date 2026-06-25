import { describe, expect, it } from "vitest";
import {
  buildClarifyMessage,
  extractJsonObject,
  parsePlannerResponse,
} from "../../engineering/cad-server/print3d-planner";

describe("print3d-planner", () => {
  it("extracts JSON from markdown fences", () => {
    const raw = 'Here is the plan:\n```json\n{"action":"clarify","userLanguage":"ro"}\n```';
    expect(extractJsonObject(raw)).toContain('"action":"clarify"');
  });

  it("parses clarify response with Romanian questions", () => {
    const plan = parsePlannerResponse(
      JSON.stringify({
        action: "clarify",
        userLanguage: "ro",
        intent: "figurine",
        pipeline: "mesh",
        questions: ["Ce înălțime (mm)?", "Bust sau figurină completă?"],
        assistantMessage: "Am nevoie de câteva detalii.",
        technicalPrompt: "cartoon mouse character placeholder",
        quickReplies: ["Bust 80mm", "Figurină 120mm"],
      })
    );
    expect(plan).not.toBeNull();
    expect(plan?.action).toBe("clarify");
    expect(plan?.userLanguage).toBe("ro");
    expect(plan?.pipeline).toBe("mesh");
    expect(plan?.questions).toHaveLength(2);
    expect(plan?.quickReplies).toHaveLength(2);
  });

  it("parses generate response for mechanical openscad", () => {
    const plan = parsePlannerResponse(
      JSON.stringify({
        action: "generate",
        userLanguage: "en",
        intent: "mechanical",
        pipeline: "openscad",
        assistantMessage: "Generating wheel.",
        technicalPrompt: "Parametric wheel 80mm width, hub M5 bore, FDM printable.",
      })
    );
    expect(plan?.action).toBe("generate");
    expect(plan?.pipeline).toBe("openscad");
    expect(plan?.technicalPrompt).toContain("80mm");
  });

  it("rejects invalid action", () => {
    expect(
      parsePlannerResponse(JSON.stringify({ action: "unknown", userLanguage: "en" }))
    ).toBeNull();
  });

  it("builds clarify message in user language", () => {
    const msg = buildClarifyMessage({
      action: "clarify",
      userLanguage: "ro",
      intent: "figurine",
      pipeline: "mesh",
      assistantMessage: "Spune-mi dimensiunea.",
      questions: ["Înălțime (mm)?"],
      technicalPrompt: "placeholder",
      warnings: ["Personaj licențiat — voi face variantă generică."],
    });
    expect(msg).toContain("Spune-mi dimensiunea.");
    expect(msg).toContain("1. Înălțime");
    expect(msg).toContain("generică");
  });
});

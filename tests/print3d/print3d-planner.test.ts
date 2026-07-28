import { describe, expect, it } from "vitest";
import {
  alignPlanWithLatestUserIntent,
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

  it("rewrites furniture substitution when user asked for a toy car", () => {
    const aligned = alignPlanWithLatestUserIntent("generează o mașină jucărie", {
      action: "generate",
      userLanguage: "ro",
      intent: "organic",
      pipeline: "mesh",
      assistantMessage: "Generez un dulap.",
      technicalPrompt: "FDM cabinet wardrobe with doors and shelves 800mm tall",
    });
    expect(aligned.pipeline).toBe("openscad");
    expect(aligned.intent).toBe("mechanical");
    expect(aligned.technicalPrompt.toLowerCase()).toMatch(/toy car|vehicle|diecast/);
    expect(aligned.technicalPrompt).toMatch(/NOT a bathtub|NOT furniture|NOT a cabinet/i);
  });

  it("rejects bathtub-with-wheels hallucination for Ferrari toy car", () => {
    const aligned = alignPlanWithLatestUserIntent("masina ferrari jucarie", {
      action: "generate",
      userLanguage: "ro",
      intent: "organic",
      pipeline: "mesh",
      assistantMessage: "Generez o cadă cu roți.",
      technicalPrompt: "FDM bathtub tub basin with four wheels under a hollow basin shell",
    });
    expect(aligned.pipeline).toBe("openscad");
    expect(aligned.intent).toBe("mechanical");
    expect(aligned.technicalPrompt.toLowerCase()).toMatch(/sports-car|coupe|toy car|ferrari|diecast/);
    expect(aligned.technicalPrompt).toMatch(/NOT a bathtub/i);
    expect(aligned.technicalPrompt.toLowerCase()).not.toMatch(/hollow basin|bathtub tub basin with four wheels/);
  });

  it("forces openscad car plan even when mesh prompt looks organic", () => {
    const aligned = alignPlanWithLatestUserIntent("o mașină Ferrari jucărie", {
      action: "generate",
      userLanguage: "ro",
      intent: "organic",
      pipeline: "mesh",
      assistantMessage: "Generez model organic.",
      technicalPrompt: "Organic freeform blob suitable for sculpture",
    });
    expect(aligned.pipeline).toBe("openscad");
    expect(aligned.technicalPrompt.toLowerCase()).toMatch(/wheel|coupe|car/);
  });

  it("forces helicopter plan when user asked for elicopter but got a box", () => {
    const aligned = alignPlanWithLatestUserIntent("generează un elicopter jucărie", {
      action: "generate",
      userLanguage: "ro",
      intent: "mechanical",
      pipeline: "openscad",
      assistantMessage: "Generez piesa.",
      technicalPrompt: "Simple rectangular prism wedge 90x42x35 mm hollow box",
    });
    expect(aligned.pipeline).toBe("openscad");
    expect(aligned.technicalPrompt.toLowerCase()).toMatch(/helicopter|rotor|fuselage/);
    expect(aligned.technicalPrompt.toLowerCase()).toMatch(/skid|tail/);
  });

  it("forces hammer/Mjolnir onto mesh and rejects furniture", () => {
    const aligned = alignPlanWithLatestUserIntent(
      "generează un ciocan tip Mjolnir",
      {
        action: "generate",
        userLanguage: "ro",
        intent: "mechanical",
        pipeline: "openscad",
        assistantMessage: "Generez un dulap cu sertare.",
        technicalPrompt: "FDM cabinet with 3 drawers and shelf unit 800mm",
      }
    );
    expect(aligned.pipeline).toBe("mesh");
    expect(aligned.technicalPrompt.toLowerCase()).toMatch(/hammer|mjolnir|handle/);
    expect(aligned.technicalPrompt.toLowerCase()).not.toMatch(/cabinet with|shelf unit|3 drawers/);
  });

  it("rejects furniture hallucination when user asked for something else", () => {
    const aligned = alignPlanWithLatestUserIntent("un robot jucărie cute", {
      action: "generate",
      userLanguage: "ro",
      intent: "mechanical",
      pipeline: "openscad",
      technicalPrompt: "Chest of drawers with sertare and cupboard doors",
    });
    expect(aligned.pipeline).toBe("mesh");
    expect(aligned.technicalPrompt.toLowerCase()).toMatch(/robot|subject/i);
    expect(aligned.warnings?.join(" ")).toMatch(/mobilier|furniture|sertare|drawer/i);
  });

  it("routes animals and insects to mesh pipeline", () => {
    const dog = alignPlanWithLatestUserIntent("generează un câine", {
      action: "generate",
      userLanguage: "ro",
      intent: "mechanical",
      pipeline: "openscad",
      technicalPrompt: "Parametric bracket M3",
    });
    expect(dog.pipeline).toBe("mesh");
    expect(dog.intent).toBe("organic");

    const bug = alignPlanWithLatestUserIntent("o insectă fluture", {
      action: "generate",
      userLanguage: "ro",
      intent: "mixed",
      pipeline: "openscad",
      technicalPrompt: "cube 20mm",
    });
    expect(bug.pipeline).toBe("mesh");
  });
});

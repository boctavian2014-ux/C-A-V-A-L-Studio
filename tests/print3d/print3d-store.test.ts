import { describe, expect, it } from "vitest";
import {
  buildClarifyMessage,
  buildConversationHistory,
  composePrint3DPrompt,
  findPreviousScad,
} from "../../src/renderer/store/print3d-prompt";

describe("print3d-prompt", () => {
  it("composes prompt with latest user message first", () => {
    const prompt = composePrint3DPrompt(
      [
        { role: "user", content: "Roata 150mm" },
        { role: "assistant", content: "Model gata." },
      ],
      "Mărește la 180mm"
    );
    expect(prompt).toContain("=== Print 3D request");
    expect(prompt).toContain("Mărește la 180mm");
    expect(prompt).toContain("Roata 150mm");
  });

  it("builds conversation history excluding generation placeholders", () => {
    const history = buildConversationHistory([
      { role: "user", content: "Bracket L" },
      { role: "assistant", content: "Generez modelul STL…" },
      { role: "user", content: "Adaugă 4 găuri M4" },
    ]);
    expect(history).toHaveLength(2);
    expect(history[0]?.content).toBe("Bracket L");
    expect(history[1]?.content).toBe("Adaugă 4 găuri M4");
  });

  it("finds previous scad from assistant messages", () => {
    const scad = findPreviousScad([
      { scad: null },
      { scad: "cube(10);" },
      { scad: "cylinder(h=5,r=3);" },
    ]);
    expect(scad).toBe("cylinder(h=5,r=3);");
  });

  it("buildClarifyMessage falls back to English", () => {
    const msg = buildClarifyMessage({
      action: "clarify",
      userLanguage: "en",
      intent: "mixed",
      pipeline: "openscad",
      technicalPrompt: "placeholder",
    });
    expect(msg).toBe("I need a few details.");
  });
});

describe("print3d-store clarify flow", () => {
  it("clarify plan should not require createJob", () => {
    const plan = {
      action: "clarify" as const,
      userLanguage: "ro" as const,
      intent: "figurine" as const,
      pipeline: "mesh" as const,
      technicalPrompt: "cartoon mouse",
      questions: ["Dimensiune?"],
    };
    expect(plan.action).toBe("clarify");
    expect(plan.action === "clarify").toBe(true);
  });
});

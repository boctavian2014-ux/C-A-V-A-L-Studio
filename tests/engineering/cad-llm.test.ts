import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildCadLlmPrompt } from "../../engineering/cad-server/scad-prompt";

describe("buildCadLlmPrompt", () => {
  it("includes wheel hints for roata prompt", () => {
    const { user } = buildCadLlmPrompt({
      prompt: "Roata drone 150mm cu hub M5",
      projectType: "drone",
    });
    expect(user).toMatch(/WHEEL|wheel|roata/i);
    expect(user).not.toContain("drone cap");
  });

  it("includes plan context", () => {
    const { user } = buildCadLlmPrompt({
      prompt: "Motor mount",
      projectType: "drone",
      planContext: { requirements: "4S power system", components: "2207 motors" },
    });
    expect(user).toContain("4S power system");
    expect(user).toContain("2207 motors");
  });

  it("includes FDM print rules", () => {
    const { system } = buildCadLlmPrompt({
      prompt: "Wall bracket",
      projectType: "custom",
    });
    expect(system).toContain("FDM 3D PRINTING RULES");
    expect(system).toContain("Minimum wall thickness 1.2 mm");
  });

  it("refine mode includes previous OpenSCAD", () => {
    const { system, user } = buildCadLlmPrompt({
      prompt: "Increase hub bore to 6mm",
      projectType: "custom",
      previousScad: "module wheel() { cylinder(h=10, r=20); }\nwheel();",
    });
    expect(system).toContain("REFINE MODE");
    expect(user).toContain("Existing OpenSCAD to modify");
    expect(user).toContain("cylinder(h=10, r=20)");
  });

  it("includes conversation history", () => {
    const { user } = buildCadLlmPrompt({
      prompt: "Add 6 spokes",
      projectType: "custom",
      conversationHistory: [
        { role: "user", content: "Wheel 150mm" },
        { role: "assistant", content: "Generated wheel" },
      ],
    });
    expect(user).toContain("Conversation history");
    expect(user).toContain("Wheel 150mm");
  });

  it("adds IoT sensor hints for air quality OLED prompt", () => {
    const { user } = buildCadLlmPrompt({
      prompt:
        "Senzor de calitate a aerului cu ecran OLED și alertă pe WiFi — enclosure 80x55x35mm with OLED window and vent slots",
      projectType: "iot",
    });
    expect(user).toMatch(/OLED|DISPLAY WINDOW/i);
    expect(user).toMatch(/VENTILATION|AIR QUALITY/i);
    expect(user).toMatch(/antenna|WiFi|buzzer/i);
  });
});

describe("llm-client without API key", () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.CAD_ALLOW_FALLBACK;
  });

  it("fails instead of mock when no key and fallback disabled", async () => {
    const { generateOpenScad } = await import("../../engineering/cad-server/llm-client");
    const result = await generateOpenScad({ prompt: "wheel 100mm" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/OPENROUTER_API_KEY/i);
  });
});

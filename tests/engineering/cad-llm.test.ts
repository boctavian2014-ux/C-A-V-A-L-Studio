import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildCadLlmPrompt } from "../../engineering/cad-server/scad-prompt";

describe("buildCadLlmPrompt", () => {
  it("adds wheel hints for roata prompt", () => {
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
      planContext: { requirements: "4S power system", bom: "2207 motors" },
    });
    expect(user).toContain("4S power system");
    expect(user).toContain("2207 motors");
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

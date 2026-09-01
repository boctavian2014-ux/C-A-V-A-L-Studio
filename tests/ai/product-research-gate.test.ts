import { describe, expect, it } from "vitest";

import { resolveProductBuildMode } from "../../ai/research/research-gate";

describe("product build mode", () => {
  it("keeps Code mode when Agentic has no tool-capable cloud provider", () => {
    const prevNv = process.env.NVIDIA_API_KEY;
    const prevOr = process.env.OPENROUTER_API_KEY;
    const prevOa = process.env.OPENAI_API_KEY;
    const prevAn = process.env.ANTHROPIC_API_KEY;
    const prevGo = process.env.GOOGLE_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    try {
      expect(resolveProductBuildMode("agentic")).toBe("code");
      expect(resolveProductBuildMode("code")).toBe("code");
    } finally {
      if (prevNv === undefined) delete process.env.NVIDIA_API_KEY;
      else process.env.NVIDIA_API_KEY = prevNv;
      if (prevOr === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prevOr;
      if (prevOa === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevOa;
      if (prevAn === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevAn;
      if (prevGo === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = prevGo;
    }
  });
});

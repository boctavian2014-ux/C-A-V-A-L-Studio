import { describe, expect, it } from "vitest";
import { resolveProviderModelId } from "../../ai/models/provider-model-id";
import { getModelProfile } from "../../ai/model-profiles";
import {
  formatContextSearchResults,
  buildProjectTreeSummary,
  buildFinalUserMessage,
} from "../../ai/context-engine/context-builder";

describe("resolveProviderModelId", () => {
  it("maps built-in OpenRouter profiles to API slugs", () => {
    const stepfun = getModelProfile("stepfun-step-3-7-flash");
    expect(stepfun).toBeTruthy();
    expect(resolveProviderModelId(stepfun!)).toBe("stepfun/step-3.7-flash");

    const nex = getModelProfile("nex-n2-pro");
    expect(resolveProviderModelId(nex!)).toBe("nex-agi/nex-n2-pro");
  });

  it("strips openrouter: prefix for catalog models", () => {
    expect(
      resolveProviderModelId({
        id: "openrouter:anthropic/claude-3.5-sonnet",
        displayName: "Claude",
        provider: "openrouter",
        capabilities: ["chat"],
        priority: 1,
        contextWindow: 32_000,
        supportsStreaming: true,
        supportsToolCalling: true,
        preferredIntents: [],
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
      })
    ).toBe("anthropic/claude-3.5-sonnet");
  });

  it("falls back to internal id when no mapping", () => {
    const local = getModelProfile("qwen2.5-coder:7b");
    expect(resolveProviderModelId(local!)).toBe("qwen2.5-coder:7b");
  });
});

describe("formatContextSearchResults", () => {
  it("reads chunk.path and chunk.text from semantic search", () => {
    const formatted = formatContextSearchResults([
      {
        chunk: { path: "src/main.ts", text: "export function main() {}" },
        score: 0.9,
      },
    ]);
    expect(formatted).toContain("src/main.ts");
    expect(formatted).toContain("export function main()");
  });

  it("supports flat legacy shape", () => {
    const formatted = formatContextSearchResults([
      { path: "README.md", snippet: "# Hello" },
    ]);
    expect(formatted).toContain("README.md");
    expect(formatted).toContain("# Hello");
  });
});

describe("buildFinalUserMessage", () => {
  it("appends active file content to the user question", () => {
    const result = buildFinalUserMessage(
      "Explică ce face acest cod",
      {
        id: "1",
        path: "src/app.ts",
        name: "app.ts",
        language: "typescript",
        content: "export function main() { return 1; }",
        isDirty: false,
      },
      "project"
    );
    expect(result).toContain("Explică ce face acest cod");
    expect(result).toContain("src/app.ts");
    expect(result).toContain("export function main()");
  });

  it("returns plain message when no active tab", () => {
    expect(buildFinalUserMessage("Hello", null, "project")).toBe("Hello");
  });
});

describe("buildProjectTreeSummary", () => {
  it("lists files and directories", () => {
    const summary = buildProjectTreeSummary([
      {
        id: "1",
        name: "src",
        path: "/proj/src",
        type: "directory",
        children: [
          { id: "2", name: "app.ts", path: "/proj/src/app.ts", type: "file" },
        ],
      },
    ]);
    expect(summary).toContain("src");
    expect(summary).toContain("app.ts");
  });
});

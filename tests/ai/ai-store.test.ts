import { describe, expect, it, vi, beforeAll } from "vitest";

const editorState = vi.hoisted(() => ({
  projectPath: "/proj/demo" as string | null,
  tabs: [] as Array<{ id: string; path: string; name: string; content: string; language: string }>,
  activeTabId: null as string | null,
  fileTree: [] as unknown[],
}));

vi.mock("../../src/renderer/store/editor-store", () => ({
  useEditorStore: Object.assign(
    (selector?: (s: typeof editorState) => unknown) => (selector ? selector(editorState) : editorState),
    {
      getState: () => ({
        ...editorState,
        closeAiPreview: vi.fn(),
        refreshTree: vi.fn().mockResolvedValue(undefined),
      }),
      setState: vi.fn(),
    }
  ),
  registerWorkspaceChangeHandler: vi.fn(),
}));

vi.mock("../../ai/safety/renderer-chat-guard", () => ({
  assertRendererChatAllowed: vi.fn(),
}));

vi.mock("../../ai/models/model-readiness", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../ai/models/model-readiness")>();
  return {
    ...actual,
    checkModelReadiness: vi.fn().mockResolvedValue({ ready: true }),
  };
});

beforeAll(() => {
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); },
    removeItem: (k: string) => { storage.delete(k); },
    clear: () => { storage.clear(); },
    key: (i: number) => [...storage.keys()][i] ?? null,
    get length() { return storage.size; },
  } as Storage;

  (globalThis as { localStorage?: Storage }).localStorage = localStorage;

  (globalThis as { window?: { caval?: Record<string, unknown>; localStorage?: Storage } }).window = {
    localStorage,
    caval: {
      resolveModel: vi.fn().mockResolvedValue({ ok: true, resolved: { modelId: "test" } }),
      chatStream: vi.fn(),
      workspaceSessionReset: vi.fn().mockResolvedValue({ ok: true }),
      onWorkspaceSessionReset: vi.fn(() => () => undefined),
    },
  };
});

describe("ai-store helpers", () => {
  it("getModelDisplayLabel resolves catalog and openrouter aliases", async () => {
    const { getModelDisplayLabel } = await import("../../ai/composer/ai-store");
    const labels = {
      "caval-auto/balanced": "Auto Balanced",
      "openrouter:anthropic/claude-sonnet-4": "Claude Sonnet 4",
    };
    expect(getModelDisplayLabel("caval-auto/balanced", labels)).toBe("Auto Balanced");
    expect(getModelDisplayLabel("anthropic/claude-sonnet-4", labels)).toBe("Claude Sonnet 4");
    expect(getModelDisplayLabel("unknown/model", labels)).toContain("unknown");
  });

  it("formatWorkingModel shows secondary for auto selection", async () => {
    const { formatWorkingModel } = await import("../../ai/composer/ai-store");
    const labels = { "caval-auto/balanced": "Auto Balanced", "stepfun/step-3.5-flash": "Step Flash" };
    const pending = formatWorkingModel("caval-auto/balanced", null, labels);
    expect(pending.primary).toBe("Auto Balanced");
    expect(pending.secondary).toBe("se rezolvă...");

    const resolved = formatWorkingModel("caval-auto/balanced", "stepfun/step-3.5-flash", labels);
    expect(resolved.primary).toBe("Step Flash");
    expect(resolved.secondary).toBe("Auto Balanced");
  });
});

describe("ai-store sendMessage readiness gate", () => {
  it("finish with error when model not ready in code mode", async () => {
    const { checkModelReadiness } = await import("../../ai/models/model-readiness");
    vi.mocked(checkModelReadiness).mockResolvedValueOnce({
      ready: false,
      reason: "Missing API key",
      hint: "Add key in Settings",
    });

    const { useAIStore } = await import("../../ai/composer/ai-store");
    const store = useAIStore.getState();
    store.setAgentMode("code");
    await store.sendMessage("hello world");

    const last = useAIStore.getState().messages.at(-1);
    expect(last?.role).toBe("assistant");
    expect(last?.error).toBe("Missing API key");
    expect(last?.content).toContain("Add key in Settings");
  });

  it("blocks agentic send without project folder", async () => {
    editorState.projectPath = null;
    const { useAIStore } = await import("../../ai/composer/ai-store");
    const store = useAIStore.getState();
    store.setAgentMode("agentic");
    await store.sendMessage("build a full app");

    const last = useAIStore.getState().messages.at(-1);
    expect(last?.error).toBe("projectPath lipsă");
    expect(last?.content).toContain("Open Folder");
  });
});

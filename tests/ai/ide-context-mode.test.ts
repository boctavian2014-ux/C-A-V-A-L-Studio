import { beforeAll, describe, expect, it, vi } from "vitest";

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

vi.mock("../../ai/models/model-readiness.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../ai/models/model-readiness.js")>();
  return {
    ...actual,
    checkModelReadiness: vi.fn().mockResolvedValue({ ready: true }),
  };
});

vi.mock("../../ai/composer/ide-context-collect", () => ({
  collectRendererIdeContext: vi.fn(() => ({
    activeFile: { path: "src/a.ts", language: "typescript", content: "x" },
  })),
}));

beforeAll(() => {
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storage.set(k, v);
    },
    removeItem: (k: string) => {
      storage.delete(k);
    },
    clear: () => {
      storage.clear();
    },
    key: (i: number) => [...storage.keys()][i] ?? null,
    get length() {
      return storage.size;
    },
  } as Storage;

  (globalThis as { localStorage?: Storage }).localStorage = localStorage;
  (globalThis as unknown as { window: { caval?: Record<string, unknown>; localStorage?: Storage } }).window = {
    localStorage,
    caval: {
      resolveModel: vi.fn().mockResolvedValue({ ok: true, resolved: { modelId: "test" } }),
      chatStream: vi.fn(),
      workspaceSessionReset: vi.fn().mockResolvedValue({ ok: true }),
      onWorkspaceSessionReset: vi.fn(() => () => undefined),
    },
  };
});

describe("ai-store ideContextMode", () => {
  it("defaults new threads to enabled and keeps toggle per thread", async () => {
    const { useAIStore } = await import("../../ai/composer/ai-store.js");
    useAIStore.setState({
      threads: [],
      activeThreadId: "",
      messages: [],
      ideContextMode: "enabled",
    });

    useAIStore.getState().newThread("A");
    const firstId = useAIStore.getState().activeThreadId;
    expect(useAIStore.getState().ideContextMode).toBe("enabled");
    expect(useAIStore.getState().threads.find((t) => t.id === firstId)?.ideContextMode).toBe(
      "enabled"
    );

    useAIStore.getState().setIdeContextMode("disabled");
    expect(useAIStore.getState().ideContextMode).toBe("disabled");
    expect(useAIStore.getState().threads.find((t) => t.id === firstId)?.ideContextMode).toBe(
      "disabled"
    );

    useAIStore.getState().newThread("B");
    const secondId = useAIStore.getState().activeThreadId;
    expect(secondId).not.toBe(firstId);
    expect(useAIStore.getState().ideContextMode).toBe("enabled");
    expect(useAIStore.getState().threads.find((t) => t.id === secondId)?.ideContextMode).toBe(
      "enabled"
    );

    useAIStore.getState().selectThread(firstId);
    expect(useAIStore.getState().ideContextMode).toBe("disabled");
  });
});

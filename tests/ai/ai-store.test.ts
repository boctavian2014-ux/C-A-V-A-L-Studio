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

vi.mock("../../ai/models/model-readiness.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../ai/models/model-readiness.js")>();
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

describe("ai-store helpers", () => {
  it("getModelDisplayLabel resolves catalog and openrouter aliases", async () => {
    const { getModelDisplayLabel } = await import("../../ai/composer/ai-store.js");
    const labels = {
      "caval-auto/balanced": "Auto Balanced",
      "openrouter:anthropic/claude-sonnet-4": "Claude Sonnet 4",
    };
    expect(getModelDisplayLabel("caval-auto/balanced", labels)).toBe("Auto Balanced");
    expect(getModelDisplayLabel("anthropic/claude-sonnet-4", labels)).toBe("Claude Sonnet 4");
    expect(getModelDisplayLabel("unknown/model", labels)).toContain("unknown");
  });

  it("formatWorkingModel shows secondary for auto selection", async () => {
    const { formatWorkingModel } = await import("../../ai/composer/ai-store.js");
    const labels = { "caval-auto/balanced": "Auto Balanced", "stepfun/step-3.5-flash": "Step Flash" };
    const pending = formatWorkingModel("caval-auto/balanced", null, labels);
    expect(pending.primary).toBe("Auto Balanced");
    expect(pending.secondary).toBe("se rezolvă...");

    const resolved = formatWorkingModel("caval-auto/balanced", "stepfun/step-3.5-flash", labels);
    expect(resolved.primary).toBe("Step Flash");
    expect(resolved.secondary).toBe("Auto Balanced");
  });

  it("formatAssistantTurnModelLabel keeps an explicit Qwen pick when runtime routes elsewhere", async () => {
    const { formatAssistantTurnModelLabel } = await import("../../ai/composer/ai-store.js");
    const labels = {
      "qwen2.5-coder:7b": "Qwen 2.5 Coder 7B",
      "nvidia/deepseek-v4-flash": "DeepSeek V4 Flash (NVIDIA NIM)",
      "caval-auto/balanced": "Auto Balanced",
    };
    expect(
      formatAssistantTurnModelLabel(
        "qwen2.5-coder:7b",
        "nvidia/deepseek-v4-flash",
        labels,
        "AI"
      )
    ).toBe("Qwen 2.5 Coder 7B → DeepSeek V4 Flash (NVIDIA NIM)");
    expect(
      formatAssistantTurnModelLabel("qwen2.5-coder:7b", "qwen2.5-coder:7b", labels, "AI")
    ).toBe("Qwen 2.5 Coder 7B");
    expect(
      formatAssistantTurnModelLabel(
        "caval-auto/balanced",
        "nvidia/deepseek-v4-flash",
        labels,
        "AI"
      )
    ).toBe("Auto Balanced → DeepSeek V4 Flash (NVIDIA NIM)");
    expect(formatAssistantTurnModelLabel(undefined, undefined, labels, "AI")).toBe("AI");
  });

  it("findRetryableStoppedTurn requires a stopped assistant after a user prompt", async () => {
    const { findRetryableStoppedTurn } = await import("../../ai/composer/ai-store.js");
    const user = {
      id: "u1",
      role: "user" as const,
      content: "build it",
      timestamp: 1,
    };
    const stopped = {
      id: "a1",
      role: "assistant" as const,
      content: "■ Oprit",
      timestamp: 2,
      multiAgentStatus: "Oprit",
    };
    expect(findRetryableStoppedTurn([user, stopped])?.user.content).toBe("build it");
    expect(
      findRetryableStoppedTurn([
        user,
        stopped,
        { id: "a2", role: "assistant", content: "done", timestamp: 3 },
      ])
    ).toBeNull();
    expect(findRetryableStoppedTurn([user])).toBeNull();
  });
});

describe("ai-store sendMessage readiness gate", () => {
  it("finish with error when model not ready in code mode", async () => {
    const { checkModelReadiness } = await import("../../ai/models/model-readiness.js");
    vi.mocked(checkModelReadiness).mockResolvedValueOnce({
      ready: false,
      reason: "Missing API key",
      hint: "Add key in Settings",
    });

    const { useAIStore } = await import("../../ai/composer/ai-store.js");
    const store = useAIStore.getState();
    store.setAgentMode("code");
    await store.sendMessage("hello world");

    const last = useAIStore.getState().messages.at(-1);
    expect(last?.role).toBe("assistant");
    expect(last?.error).toBe("Missing API key");
    expect(last?.content).toContain("Add key in Settings");
  });

  it("auto-creates Desktop/Downloads project when agentic has no folder", async () => {
    editorState.projectPath = null;
    const win = (globalThis as unknown as { window: { caval: Record<string, unknown> } }).window;
    win.caval.workspace = {
      createOnDesktop: vi.fn().mockResolvedValue({
        ok: false,
        error: "Nu am putut crea folderul pe Desktop sau în Downloads.",
      }),
    };
    const { useAIStore } = await import("../../ai/composer/ai-store.js");
    useAIStore.setState({ agentMode: "agentic" });
    const store = useAIStore.getState();
    await store.sendMessage("build a full app");

    const last = useAIStore.getState().messages.at(-1);
    expect(last?.role).toBe("assistant");
    expect(last?.error).toMatch(/Desktop|Downloads/i);
    editorState.projectPath = "/proj/demo";
  });

  it("keeps Ask read-only for a product brief with no workspace", async () => {
    editorState.projectPath = null;
    const win = (globalThis as unknown as { window: { caval: Record<string, unknown> } }).window;
    const createOnDesktop = vi.fn();
    const chatStream = vi.fn();
    win.caval.workspace = { createOnDesktop };
    win.caval.chatStream = chatStream;

    const { useAIStore } = await import("../../ai/composer/ai-store.js");
    useAIStore.setState({ agentMode: "ask", messages: [], pendingProductResearch: null });
    const beforeMode = useAIStore.getState().agentMode;

    await useAIStore.getState().sendMessage("fă un magazin de baschet");

    expect(beforeMode).toBe("ask");
    expect(useAIStore.getState().agentMode).toBe("ask");
    expect(createOnDesktop).not.toHaveBeenCalled();
    expect(chatStream).not.toHaveBeenCalled();
    const last = useAIStore.getState().messages.at(-1);
    expect(last?.role).toBe("assistant");
    expect(last?.content).toMatch(/schimbă în Code|Open in Code/i);
    editorState.projectPath = "/proj/demo";
  });

  it("keeps Plan read-only for a product brief with no workspace", async () => {
    editorState.projectPath = null;
    const win = (globalThis as unknown as { window: { caval: Record<string, unknown> } }).window;
    const createOnDesktop = vi.fn();
    const chatStream = vi.fn();
    win.caval.workspace = { createOnDesktop };
    win.caval.chatStream = chatStream;

    const { useAIStore } = await import("../../ai/composer/ai-store.js");
    useAIStore.setState({ agentMode: "plan", messages: [], pendingProductResearch: null });

    await useAIStore.getState().sendMessage("fă un magazin de baschet");

    expect(useAIStore.getState().agentMode).toBe("plan");
    expect(createOnDesktop).not.toHaveBeenCalled();
    expect(chatStream).not.toHaveBeenCalled();
    const last = useAIStore.getState().messages.at(-1);
    expect(last?.role).toBe("assistant");
    expect(last?.content).toMatch(/schimbă în Code|Open in Code/i);
    editorState.projectPath = "/proj/demo";
  });

  it("shows the user bubble before awaiting the stream", async () => {
    const { useAIStore } = await import("../../ai/composer/ai-store.js");
    useAIStore.setState({ agentMode: "ask", messages: [], pendingProductResearch: null });
    const pending = useAIStore.getState().sendMessage("zxq-once-only-7f2c");
    const first = useAIStore.getState().messages[0];
    expect(first?.role).toBe("user");
    expect(first?.content).toBe("zxq-once-only-7f2c");
    await pending;
    const users = useAIStore.getState().messages.filter((m) => m.role === "user");
    expect(users).toHaveLength(1);
    editorState.projectPath = "/proj/demo";
  });

  it("sends the new user turn once in Fast Chat request context", async () => {
    const probe = "zxq-once-only-7f2c";
    const win = (globalThis as unknown as { window: { caval: Record<string, unknown> } }).window;
    let captured: {
      message?: string;
      messages?: Array<{ role: string; content: string }>;
    } | null = null;
    win.caval.chatStream = vi.fn((req: { message?: string; messages?: Array<{ role: string; content: string }> }) => {
      captured = req;
      return () => undefined;
    });

    const { buildFastChatMessages } = await import("../../ai/context-engine/context-builder");
    const wouldDuplicate = buildFastChatMessages(probe, [{ role: "user", content: probe }], "ask");
    expect(
      wouldDuplicate.filter((m) => m.role === "user" && m.content.includes(probe))
    ).toHaveLength(2);

    const { useAIStore } = await import("../../ai/composer/ai-store.js");
    useAIStore.setState({
      agentMode: "ask",
      messages: [],
      pendingProductResearch: null,
      isStreaming: false,
    });
    await useAIStore.getState().sendMessage(probe);

    expect(win.caval.chatStream).toHaveBeenCalled();
    expect(captured).toBeTruthy();
    const contextUserTurns = (captured?.messages ?? []).filter(
      (m) => m.role === "user" && m.content.includes(probe)
    );
    expect(contextUserTurns).toHaveLength(1);
    expect(captured?.message).toBe(probe);
    editorState.projectPath = "/proj/demo";
  });

  it("retry after Stop resends the same user turn without duplicating the bubble", async () => {
    const probe = "zxq-retry-after-stop-91";
    const win = (globalThis as unknown as { window: { caval: Record<string, unknown> } }).window;
    win.caval.chatStream = vi.fn(() => () => undefined);
    win.caval.abortChatStream = vi.fn().mockResolvedValue({ ok: true });

    const { useAIStore } = await import("../../ai/composer/ai-store.js");
    useAIStore.setState({
      agentMode: "code",
      messages: [],
      pendingProductResearch: null,
      isStreaming: false,
    });
    await useAIStore.getState().sendMessage(probe);

    expect(useAIStore.getState().isStreaming).toBe(true);
    useAIStore.getState().stopStreaming();

    const afterStop = useAIStore.getState();
    expect(afterStop.isStreaming).toBe(false);
    expect(afterStop.messages.filter((m) => m.role === "user")).toHaveLength(1);
    expect(afterStop.messages.some((m) => m.multiAgentStatus === "Oprit")).toBe(true);

    await useAIStore.getState().retryLastTurn();

    const afterRetry = useAIStore.getState();
    expect(afterRetry.messages.filter((m) => m.role === "user")).toHaveLength(1);
    expect(afterRetry.messages.filter((m) => m.role === "user")[0]?.content).toBe(probe);
    const assistants = afterRetry.messages.filter((m) => m.role === "assistant");
    expect(assistants.length).toBeGreaterThanOrEqual(2);
    expect(assistants.some((m) => m.multiAgentStatus === "Oprit")).toBe(true);
    expect(assistants.some((m) => m.isStreaming || m.id !== assistants[0]?.id)).toBe(true);
    editorState.projectPath = "/proj/demo";
  });
});

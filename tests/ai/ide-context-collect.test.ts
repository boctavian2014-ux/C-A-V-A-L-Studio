import { beforeEach, describe, expect, it, vi } from "vitest";

const editorState = vi.hoisted(() => ({
  projectPath: "/proj" as string | null,
  tabs: [] as Array<{
    id: string;
    path: string;
    name: string;
    content: string;
    language: string;
    isDirty: boolean;
  }>,
  activeTabId: null as string | null,
  editorSelection: null as null | {
    text: string;
    path: string;
    startLine: number;
    endLine: number;
  },
}));

const problemsState = vi.hoisted(() => ({
  problems: [] as Array<{
    id: string;
    file: string;
    line: number;
    col: number;
    message: string;
    severity: "error" | "warning" | "info";
    source?: string;
  }>,
}));

const gitState = vi.hoisted(() => ({
  isRepo: true,
  branch: "main",
  files: [] as Array<{ path: string }>,
}));

const outputState = vi.hoisted(() => ({
  channels: [{ name: "CAVAL", lines: [] as string[] }],
  activeChannel: "CAVAL",
}));

vi.mock("../../src/renderer/store/editor-store", () => ({
  useEditorStore: {
    getState: () => editorState,
  },
}));

vi.mock("../../src/renderer/store/problems-store", () => ({
  useProblemsStore: {
    getState: () => problemsState,
  },
}));

vi.mock("../../src/renderer/store/git-store", () => ({
  useGitStore: {
    getState: () => gitState,
  },
}));

vi.mock("../../src/renderer/store/output-store", () => ({
  useOutputStore: {
    getState: () => outputState,
  },
}));

describe("collectRendererIdeContext", () => {
  beforeEach(() => {
    editorState.tabs = [];
    editorState.activeTabId = null;
    editorState.editorSelection = null;
    problemsState.problems = [];
    gitState.files = [];
    gitState.branch = "main";
    outputState.channels = [{ name: "CAVAL", lines: [] }];
  });

  it("returns undefined when there is nothing useful", async () => {
    gitState.isRepo = false;
    gitState.branch = "";
    const { collectRendererIdeContext } = await import("../../ai/composer/ide-context-collect");
    expect(collectRendererIdeContext()).toBeUndefined();
  });

  it("omits .env active files after sanitize", async () => {
    editorState.tabs = [
      {
        id: "1",
        path: ".env",
        name: ".env",
        content: "SECRET=sk-or-v1-abcdefghijklmnop",
        language: "plaintext",
        isDirty: false,
      },
    ];
    editorState.activeTabId = "1";
    gitState.isRepo = true;
    gitState.branch = "main";
    gitState.files = [{ path: "src/a.ts" }];

    const { collectRendererIdeContext } = await import("../../ai/composer/ide-context-collect");
    const ctx = collectRendererIdeContext();
    expect(ctx?.activeFile).toBeUndefined();
    expect(ctx?.git?.changedFiles).toEqual(["src/a.ts"]);
  });

  it("includes selection text when present", async () => {
    editorState.tabs = [
      {
        id: "1",
        path: "src/a.ts",
        name: "a.ts",
        content: "line1\nline2\n",
        language: "typescript",
        isDirty: false,
      },
    ];
    editorState.activeTabId = "1";
    editorState.editorSelection = {
      path: "src/a.ts",
      text: "line2",
      startLine: 2,
      endLine: 2,
    };

    const { collectRendererIdeContext } = await import("../../ai/composer/ide-context-collect");
    const ctx = collectRendererIdeContext();
    expect(ctx?.activeFile?.selection?.text).toBe("line2");
    expect(ctx?.activeFile?.content).toBeUndefined();
  });
});

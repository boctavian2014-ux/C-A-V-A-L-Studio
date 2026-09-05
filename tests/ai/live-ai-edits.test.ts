/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";

import {
  collectLiveAiEditFilesForDisk,
  computeLiveDiffLines,
  selectActiveAiEditPaths,
  selectLiveEditsList,
  tabPathMatchesLiveEdit,
  useLiveAiEditsStore,
} from "../../ai/composer/live-ai-edits-store";

describe("live-ai-edits-store", () => {
  beforeEach(() => {
    useLiveAiEditsStore.getState().clearAll();
  });

  it("tracks begin → progress → complete and emits CustomEvents", () => {
    const events: string[] = [];
    const handler = (e: Event) => events.push(e.type);
    window.addEventListener("ai-edit-start", handler);
    window.addEventListener("ai-edit-progress", handler);
    window.addEventListener("ai-edit-complete", handler);

    const store = useLiveAiEditsStore.getState();
    store.beginEdit("src/App.tsx");
    store.progressEdit("src/App.tsx", "export const A = 1;\n");
    store.beginEdit("src/main.tsx");
    store.progressEdit("src/main.tsx", "import './App';\n");
    store.beginEdit("package.json");
    store.completeEdit("src/App.tsx", "export const A = 1;\n");
    store.completeEdit("src/main.tsx");
    store.failEdit("package.json");

    const list = selectLiveEditsList(useLiveAiEditsStore.getState());
    expect(list).toHaveLength(3);
    expect(list.map((e) => e.path)).toEqual([
      "src/App.tsx",
      "src/main.tsx",
      "package.json",
    ]);
    expect(list[0]?.status).toBe("done");
    expect(list[1]?.status).toBe("done");
    expect(list[2]?.status).toBe("error");
    expect(selectActiveAiEditPaths(useLiveAiEditsStore.getState()).size).toBe(0);

    expect(events).toContain("ai-edit-start");
    expect(events).toContain("ai-edit-progress");
    expect(events).toContain("ai-edit-complete");

    window.removeEventListener("ai-edit-start", handler);
    window.removeEventListener("ai-edit-progress", handler);
    window.removeEventListener("ai-edit-complete", handler);
  });

  it("setProposed queues waiting until beginEdit promotes to writing", () => {
    const store = useLiveAiEditsStore.getState();
    store.setProposed([
      {
        path: "a.ts",
        content: "console.log(1);\n",
        previousContent: "console.log(0);\n",
        isNew: false,
      },
      { path: "b.ts", content: "x\n", isNew: true },
    ]);
    let list = selectLiveEditsList(useLiveAiEditsStore.getState());
    expect(list.every((e) => e.status === "waiting")).toBe(true);
    expect(selectActiveAiEditPaths(useLiveAiEditsStore.getState()).size).toBe(0);

    store.beginEdit("a.ts");
    list = selectLiveEditsList(useLiveAiEditsStore.getState());
    expect(list.find((e) => e.path === "a.ts")?.status).toBe("writing");
    expect(list.find((e) => e.path === "b.ts")?.status).toBe("waiting");
    expect(selectActiveAiEditPaths(useLiveAiEditsStore.getState()).has("a.ts")).toBe(true);

    store.clearAll();
    expect(selectLiveEditsList(useLiveAiEditsStore.getState())).toHaveLength(0);
  });

  it("tabPathMatchesLiveEdit matches absolute and preview paths", () => {
    expect(
      tabPathMatchesLiveEdit(
        "C:/Users/me/proj/src/App.tsx",
        "src/App.tsx",
        "C:/Users/me/proj"
      )
    ).toBe(true);
    expect(tabPathMatchesLiveEdit("preview://src/App.tsx", "src/App.tsx")).toBe(true);
    expect(tabPathMatchesLiveEdit("C:/other/App.tsx", "src/App.tsx", "C:/Users/me/proj")).toBe(
      false
    );
  });

  it("keeps done edits until clearAll (no premature wipe)", () => {
    const s = useLiveAiEditsStore.getState();
    s.beginEdit("src/a.ts");
    s.progressEdit("src/a.ts", "a");
    s.completeEdit("src/a.ts");
    expect(selectLiveEditsList(useLiveAiEditsStore.getState())).toHaveLength(1);
    expect(selectLiveEditsList(useLiveAiEditsStore.getState())[0]?.status).toBe("done");
    expect(selectActiveAiEditPaths(useLiveAiEditsStore.getState()).size).toBe(0);
    expect(selectLiveEditsList(useLiveAiEditsStore.getState())[0]?.path).toBe("src/a.ts");
    s.clearAll();
    expect(selectLiveEditsList(useLiveAiEditsStore.getState())).toHaveLength(0);
  });

  it("beginEdit alone shows writing status before content arrives", () => {
    useLiveAiEditsStore.getState().beginEdit("src/pending.ts");
    const list = selectLiveEditsList(useLiveAiEditsStore.getState());
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe("writing");
    expect(selectActiveAiEditPaths(useLiveAiEditsStore.getState()).has("src/pending.ts")).toBe(
      true
    );
  });

  it("collectLiveAiEditFilesForDisk persists preview paths and skips propose-only", () => {
    const store = useLiveAiEditsStore.getState();
    store.beginEdit("preview://src/components/Contact.tsx");
    store.progressEdit("preview://src/components/Contact.tsx", "export function Contact() { return null; }");
    store.setProposed([{ path: "src/Proposed.tsx", content: "propose only", isNew: true }]);
    expect(collectLiveAiEditFilesForDisk()).toEqual([]);
    store.clearAll();
    store.beginEdit("src/App.tsx");
    store.progressEdit("src/App.tsx", "export default function App() { return <div />; }");
    store.beginEdit("preview://src/main.tsx");
    store.progressEdit("preview://src/main.tsx", "import App from './App';");
    expect(collectLiveAiEditFilesForDisk()).toEqual([
      { path: "src/App.tsx", content: "export default function App() { return <div />; }" },
      { path: "src/main.tsx", content: "import App from './App';" },
    ]);
  });
});

describe("computeLiveDiffLines", () => {
  it("marks all lines added when no previous content", () => {
    const lines = computeLiveDiffLines("", "a\nb\n");
    expect(lines.every((l) => l.kind === "added")).toBe(true);
    expect(lines).toHaveLength(3);
  });

  it("marks modified and added lines", () => {
    const lines = computeLiveDiffLines("hello\nworld", "hello\nWORLD\nextra");
    expect(lines.find((l) => l.lineNumber === 2)?.kind).toBe("modified");
    expect(lines.find((l) => l.lineNumber === 3)?.kind).toBe("added");
  });
});

describe("peekStreamingScaffoldPath", () => {
  it("returns path from incomplete open fence", async () => {
    const { peekStreamingScaffoldPath } = await import("../../ai/composer/scaffold-parser");
    expect(
      peekStreamingScaffoldPath("```ts:src/App.tsx\n")
    ).toBe("src/App.tsx");
    expect(peekStreamingScaffoldPath("hello")).toBeNull();
  });
});

describe("simulate three-file stream", () => {
  beforeEach(() => {
    useLiveAiEditsStore.getState().clearAll();
  });

  it("updates live list in real time for 3 files", () => {
    const s = useLiveAiEditsStore.getState();
    s.beginEdit("f1.ts");
    s.progressEdit("f1.ts", "1");
    expect(selectLiveEditsList(useLiveAiEditsStore.getState())).toHaveLength(1);
    s.beginEdit("f2.ts");
    s.progressEdit("f2.ts", "2");
    s.beginEdit("f3.ts");
    expect(selectActiveAiEditPaths(useLiveAiEditsStore.getState()).size).toBe(3);
    s.completeEdit("f1.ts");
    s.completeEdit("f2.ts");
    s.completeEdit("f3.ts");
    expect(selectActiveAiEditPaths(useLiveAiEditsStore.getState()).size).toBe(0);
    expect(selectLiveEditsList(useLiveAiEditsStore.getState()).every((e) => e.status === "done")).toBe(
      true
    );
  });
});

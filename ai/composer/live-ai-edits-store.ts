import { create } from "zustand";

import type { ProposedWrite } from "../../src/shared/ai-chat-apply-contract";
import { normalizeProposedPath } from "../../src/shared/ai-chat-apply-contract";

export type LiveAiEditStatus = "waiting" | "writing" | "done" | "error";

export type LiveAiEditEventType =
  | "ai-edit-start"
  | "ai-edit-progress"
  | "ai-edit-complete"
  | "ai-edit-error"
  | "ai-edit-clear";

export interface LiveAiEdit {
  path: string;
  status: LiveAiEditStatus;
  content?: string;
  previousContent?: string;
  updatedAt: number;
}

export interface LiveAiEditEventDetail {
  path?: string;
  status?: LiveAiEditStatus;
  content?: string;
}

interface LiveAiEditsState {
  edits: Record<string, LiveAiEdit>;
  order: string[];
  beginEdit: (path: string, previousContent?: string) => void;
  progressEdit: (path: string, content: string) => void;
  completeEdit: (path: string, content?: string) => void;
  failEdit: (path: string) => void;
  setProposed: (writes: ProposedWrite[]) => void;
  clearAll: () => void;
}

function emit(type: LiveAiEditEventType, detail: LiveAiEditEventDetail = {}): void {
  if (typeof globalThis === "undefined") return;
  const g = globalThis as typeof globalThis & {
    dispatchEvent?: (event: Event) => boolean;
    CustomEvent?: typeof CustomEvent;
  };
  if (typeof g.dispatchEvent !== "function" || typeof g.CustomEvent !== "function") return;
  g.dispatchEvent(new g.CustomEvent(type, { detail }));
}

function normPath(path: string): string {
  return normalizeProposedPath(path);
}

export const useLiveAiEditsStore = create<LiveAiEditsState>((set) => ({
  edits: {},
  order: [],

  beginEdit: (rawPath, previousContent) => {
    const path = normPath(rawPath);
    if (!path) return;
    set((s) => {
      const prev = s.edits[path];
      const next: LiveAiEdit = {
        path,
        status: "writing",
        content: prev?.content,
        previousContent: previousContent ?? prev?.previousContent ?? "",
        updatedAt: Date.now(),
      };
      const order = s.order.includes(path) ? s.order : [...s.order, path];
      return { edits: { ...s.edits, [path]: next }, order };
    });
    emit("ai-edit-start", { path, status: "writing" });
  },

  progressEdit: (rawPath, content) => {
    const path = normPath(rawPath);
    if (!path) return;
    set((s) => {
      const prev = s.edits[path];
      const next: LiveAiEdit = {
        path,
        status: "writing",
        content,
        previousContent: prev?.previousContent ?? "",
        updatedAt: Date.now(),
      };
      const order = s.order.includes(path) ? s.order : [...s.order, path];
      return { edits: { ...s.edits, [path]: next }, order };
    });
    emit("ai-edit-progress", { path, status: "writing", content });
  },

  completeEdit: (rawPath, content) => {
    const path = normPath(rawPath);
    if (!path) return;
    set((s) => {
      const prev = s.edits[path];
      const next: LiveAiEdit = {
        path,
        status: "done",
        content: content ?? prev?.content,
        previousContent: prev?.previousContent ?? "",
        updatedAt: Date.now(),
      };
      const order = s.order.includes(path) ? s.order : [...s.order, path];
      return { edits: { ...s.edits, [path]: next }, order };
    });
    emit("ai-edit-complete", { path, status: "done", content });
  },

  failEdit: (rawPath) => {
    const path = normPath(rawPath);
    if (!path) return;
    set((s) => {
      const prev = s.edits[path];
      if (!prev && !s.order.includes(path)) {
        return {
          edits: {
            ...s.edits,
            [path]: { path, status: "error", updatedAt: Date.now() },
          },
          order: [...s.order, path],
        };
      }
      return {
        edits: {
          ...s.edits,
          [path]: { ...prev!, path, status: "error", updatedAt: Date.now() },
        },
      };
    });
    emit("ai-edit-error", { path, status: "error" });
  },

  setProposed: (writes) => {
    const edits: Record<string, LiveAiEdit> = {};
    const order: string[] = [];
    for (const w of writes) {
      const path = normPath(w.path);
      if (!path) continue;
      edits[path] = {
        path,
        status: "waiting",
        content: w.content,
        previousContent: w.previousContent ?? "",
        updatedAt: Date.now(),
      };
      order.push(path);
    }
    set({ edits, order });
  },

  clearAll: () => {
    set({ edits: {}, order: [] });
    emit("ai-edit-clear", {});
  },
}));

/** Paths currently being written (for tab spinner). */
export function selectActiveAiEditPaths(state: LiveAiEditsState): Set<string> {
  return new Set(
    Object.values(state.edits)
      .filter((e) => e.status === "writing")
      .map((e) => e.path)
  );
}

export function selectLiveEditsList(state: LiveAiEditsState): LiveAiEdit[] {
  return state.order.map((p) => state.edits[p]).filter(Boolean) as LiveAiEdit[];
}

/**
 * Live preview / streaming edits that should land in the open workspace.
 * Skips propose-only (waiting) and empty buffers. Paths stay workspace-relative.
 */
export function collectLiveAiEditFilesForDisk(
  state: Pick<LiveAiEditsState, "edits" | "order"> = useLiveAiEditsStore.getState()
): Array<{ path: string; content: string }> {
  const out: Array<{ path: string; content: string }> = [];
  for (const raw of state.order) {
    const edit = state.edits[raw];
    if (!edit || edit.status === "waiting" || edit.status === "error") continue;
    if (!edit.content?.trim()) continue;
    let path = edit.path.replace(/\\/g, "/");
    if (path.startsWith("preview://")) path = path.slice("preview://".length);
    path = path.replace(/^\.\//, "").replace(/^\/+/, "");
    if (!path || path.includes("..") || /:/.test(path)) continue;
    out.push({ path, content: edit.content });
  }
  return out;
}

export function tabPathMatchesLiveEdit(
  tabPath: string,
  editPath: string,
  projectPath?: string | null
): boolean {
  const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
  const tab = norm(tabPath);
  const edit = norm(editPath);
  if (!tab || !edit) return false;
  if (tab.startsWith("preview://") && norm(tab.slice("preview://".length)) === edit) {
    return true;
  }
  if (tab === edit || tab.endsWith("/" + edit)) return true;
  if (projectPath) {
    const abs = norm(`${projectPath.replace(/[/\\]+$/, "")}/${edit}`);
    if (tab === abs) return true;
  }
  return false;
}

/** Line-level decoration kinds for Monaco live diffs. */
export type LiveDiffKind = "added" | "removed" | "modified";

export function computeLiveDiffLines(
  previousContent: string | undefined,
  nextContent: string | undefined
): Array<{ lineNumber: number; kind: LiveDiffKind }> {
  const prev = (previousContent ?? "").split("\n");
  const next = (nextContent ?? "").split("\n");
  const out: Array<{ lineNumber: number; kind: LiveDiffKind }> = [];

  if (!previousContent?.length) {
    for (let i = 0; i < next.length; i++) {
      if (next[i] !== undefined) out.push({ lineNumber: i + 1, kind: "added" });
    }
    return out;
  }

  const max = Math.max(prev.length, next.length);
  for (let i = 0; i < max; i++) {
    const a = prev[i];
    const b = next[i];
    if (a === undefined && b !== undefined) {
      out.push({ lineNumber: i + 1, kind: "added" });
    } else if (a !== undefined && b === undefined) {
      // Removed lines: mark last visible next line as removed hint when possible
      if (next.length > 0) {
        out.push({ lineNumber: Math.min(i + 1, next.length), kind: "removed" });
      }
    } else if (a !== b) {
      out.push({ lineNumber: i + 1, kind: "modified" });
    }
  }
  return out;
}

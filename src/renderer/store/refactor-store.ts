import { create } from "zustand";

import type { TimelineEvent } from "../../shared/ai-timeline-contract";
import type {
  RefactorFileEdit,
  RefactorKind,
  RefactorResult,
} from "../../shared/ai-refactor-contract";

export type RefactorPhase = "idle" | "loading" | "preview" | "applying" | "error";

export interface RefactorPreviewFile {
  filePath: string;
  originalText: string;
  modifiedText: string;
  edit: RefactorFileEdit;
}

export interface RefactorSession {
  phase: RefactorPhase;
  kind: RefactorKind;
  files: RefactorPreviewFile[];
  activePath?: string;
  explanation?: string;
  error?: string;
  timelineEvents: TimelineEvent[];
}

interface RefactorStore {
  session: RefactorSession | null;
  lastApplied: RefactorPreviewFile[] | null;
  setSession: (session: RefactorSession | null) => void;
  patch: (patch: Partial<RefactorSession>) => void;
  setActivePath: (path: string) => void;
  setLastApplied: (files: RefactorPreviewFile[] | null) => void;
  clear: () => void;
}

export const useRefactorStore = create<RefactorStore>((set) => ({
  session: null,
  lastApplied: null,
  setSession: (session) => set({ session }),
  patch: (patch) =>
    set((s) => (s.session ? { session: { ...s.session, ...patch } } : s)),
  setActivePath: (path) =>
    set((s) =>
      s.session ? { session: { ...s.session, activePath: path } } : s
    ),
  setLastApplied: (files) => set({ lastApplied: files }),
  clear: () => set({ session: null }),
}));

export type { RefactorResult };

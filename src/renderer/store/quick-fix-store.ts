import { create } from "zustand";

import type { TimelineEvent } from "../../shared/ai-timeline-contract";
import type {
  QuickFixDiagnostic,
  QuickFixEdit,
  QuickFixResult,
} from "../../shared/ai-quick-fix-contract";

export type QuickFixPhase = "idle" | "loading" | "preview" | "applying" | "error";

export interface QuickFixSession {
  phase: QuickFixPhase;
  filePath: string;
  absolutePath: string;
  originalText: string;
  modifiedText: string;
  diagnostic: QuickFixDiagnostic;
  edits: QuickFixEdit[];
  explanation?: string;
  error?: string;
  proposeStreamId?: string;
  timelineEvents: TimelineEvent[];
}

interface QuickFixStore {
  session: QuickFixSession | null;
  setSession: (session: QuickFixSession | null) => void;
  patchSession: (patch: Partial<QuickFixSession>) => void;
  clear: () => void;
}

export const useQuickFixStore = create<QuickFixStore>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
  patchSession: (patch) =>
    set((s) => (s.session ? { session: { ...s.session, ...patch } } : s)),
  clear: () => set({ session: null }),
}));

export type { QuickFixResult };

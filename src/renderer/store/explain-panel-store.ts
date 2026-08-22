import { create } from "zustand";

import type { ExplainSelection } from "../../shared/ai-explain-contract";

export type ExplainPanelPhase = "idle" | "loading" | "ready" | "error";

export interface ExplainPanelState {
  phase: ExplainPanelPhase;
  filePath: string;
  selection: ExplainSelection;
  explanation?: string;
  error?: string;
}

interface ExplainPanelStore {
  panel: ExplainPanelState | null;
  setPanel: (panel: ExplainPanelState | null) => void;
  patch: (patch: Partial<ExplainPanelState>) => void;
  clear: () => void;
}

export const useExplainPanelStore = create<ExplainPanelStore>((set) => ({
  panel: null,
  setPanel: (panel) => set({ panel }),
  patch: (patch) =>
    set((s) => (s.panel ? { panel: { ...s.panel, ...patch } } : s)),
  clear: () => set({ panel: null }),
}));

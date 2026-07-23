import { create } from 'zustand';
import type { EngProject } from '../../../ai/engineering/engineering-generator';
import type { RoboticsComponentBom } from '../../../ai/engineering/robotics-components-schema';
import type { ParsedRoboticsPlan } from '../../../ai/engineering/robotics-format';
import { ROBOTICS_TAB_GROUPS } from '../../../ai/engineering/robotics-format';
import type { SectionStreamSnapshot } from '../../../ai/engineering/streaming-sections';

export type RoboticsTabId = (typeof ROBOTICS_TAB_GROUPS)[number]['id'];

interface RoboticsSessionState {
  prompt: string;
  loading: boolean;
  error: string | null;
  warning: string | null;
  project: EngProject | null;
  plan: ParsedRoboticsPlan | null;
  bom: RoboticsComponentBom | null;
  activeTab: RoboticsTabId;
  streamProgress: SectionStreamSnapshot | null;
  userTabLocked: boolean;
  /** Active chat stream id (for abortChatStream). */
  streamId: string | null;

  setPrompt: (prompt: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setWarning: (warning: string | null) => void;
  setProject: (project: EngProject | null) => void;
  setPlan: (plan: ParsedRoboticsPlan | null) => void;
  setBom: (bom: RoboticsComponentBom | null) => void;
  setActiveTab: (tab: RoboticsTabId) => void;
  setStreamProgress: (snap: SectionStreamSnapshot | null) => void;
  setUserTabLocked: (locked: boolean) => void;
  setStreamId: (id: string | null) => void;
  beginGenerate: () => void;
  /** End stream UI state. Pass abortController only for manual Stop. */
  finalizeStream: (opts?: {
    abortController?: AbortController | null;
    callAbortChat?: boolean;
    /** When true, abort the AbortController (manual Stop only). */
    abortSignal?: boolean;
  }) => void;
  resetResults: () => void;
}

export const useRoboticsSessionStore = create<RoboticsSessionState>()((set, get) => ({
  prompt: '',
  loading: false,
  error: null,
  warning: null,
  project: null,
  plan: null,
  bom: null,
  activeTab: 'overview',
  streamProgress: null,
  userTabLocked: false,
  streamId: null,

  setPrompt: (prompt) => set({ prompt }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setWarning: (warning) => set({ warning }),
  setProject: (project) => set({ project }),
  setPlan: (plan) => set({ plan }),
  setBom: (bom) => set({ bom }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setStreamProgress: (streamProgress) => set({ streamProgress }),
  setUserTabLocked: (userTabLocked) => set({ userTabLocked }),
  setStreamId: (streamId) => set({ streamId }),

  beginGenerate: () =>
    set({
      loading: true,
      error: null,
      warning: null,
      bom: null,
      plan: null,
      project: null,
      streamProgress: null,
      userTabLocked: false,
      streamId: null,
      activeTab: 'overview',
    }),

  finalizeStream: (opts) => {
    const { streamId } = get();
    if (opts?.abortSignal && opts.abortController) {
      opts.abortController.abort();
    }
    if (opts?.callAbortChat !== false && streamId) {
      void window.caval?.abortChatStream?.(streamId);
    }
    set({
      loading: false,
      streamProgress: null,
      streamId: null,
    });
  },

  resetResults: () =>
    set({
      project: null,
      plan: null,
      bom: null,
      warning: null,
      error: null,
      streamProgress: null,
      activeTab: 'overview',
      userTabLocked: false,
    }),
}));

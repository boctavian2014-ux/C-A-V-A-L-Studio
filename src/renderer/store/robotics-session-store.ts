import { issueAbortChatStreamOnce } from '../../../ai/engineering/stream-abort-once';
import { create } from 'zustand';
import type { EngProject } from '../../../ai/engineering/engineering-generator';
import type { RoboticsComponentBom } from '../../../ai/engineering/robotics-components-schema';
import type { ParsedRoboticsPlan } from '../../../ai/engineering/robotics-format';
import { ROBOTICS_TAB_GROUPS } from '../../../ai/engineering/robotics-format';
import type { SectionStreamSnapshot } from '../../../ai/engineering/streaming-sections';

export type RoboticsTabId = (typeof ROBOTICS_TAB_GROUPS)[number]['id'];

export type RoboticsStreamingMode = 'idle' | 'streaming' | 'fallback';

export {
  issueAbortChatStreamOnce,
  resetIssuedChatAborts,
  getIssuedChatAbortCount,
} from '../../../ai/engineering/stream-abort-once';

/** Resolve text used by Generează 3D after the composer is cleared. */
export function resolveRoboticsCadUserPrompt(input: {
  lastPrompt?: string | null;
  prompt?: string | null;
  project?: EngProject | null;
  plan?: ParsedRoboticsPlan | null;
}): string {
  const fromComposer = input.lastPrompt?.trim() || input.prompt?.trim();
  if (fromComposer) return fromComposer;

  const summary = input.plan?.sections?.summary?.trim();
  if (summary) {
    const firstLine = summary.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    if (firstLine) return firstLine.slice(0, 500);
  }

  const title = input.project?.spec?.title?.trim();
  const projectSummary = input.project?.spec?.summary?.trim();
  if (title && projectSummary) return `${title}. ${projectSummary}`.slice(0, 500);
  if (title) return title;
  if (projectSummary) return projectSummary.slice(0, 500);
  return '';
}

/** Ignore updates from a stale or already-settled stream. */
export function shouldApplyStreamUpdate(
  activeStreamId: string | null,
  eventStreamId: string | null | undefined,
  streamSettled: boolean
): boolean {
  if (streamSettled) return false;
  if (!eventStreamId) return false;
  if (!activeStreamId) return true;
  return activeStreamId === eventStreamId;
}

interface RoboticsSessionState {
  prompt: string;
  /** Last successfully submitted prompt (kept after textarea clears, for CAD/handoff). */
  lastPrompt: string;
  loading: boolean;
  error: string | null;
  warning: string | null;
  project: EngProject | null;
  plan: ParsedRoboticsPlan | null;
  bom: RoboticsComponentBom | null;
  activeTab: RoboticsTabId;
  streamProgress: SectionStreamSnapshot | null;
  userTabLocked: boolean;
  /** Active chat stream id (session/request id for abort + stale guards). */
  streamId: string | null;
  streamingMode: RoboticsStreamingMode;
  /** True while provider emits reasoning-only activity (not document content). */
  reasoningActive: boolean;
  /** Partial output kept after error/abort. */
  incomplete: boolean;
  /** After done/error/abort for the active stream — ignore further updates. */
  streamSettled: boolean;
  /** P2 unified cancel UX. */
  cancelStatus: "idle" | "aborting" | "aborted" | "failed_remote";
  cancelMessage: string | null;

  setPrompt: (prompt: string) => void;
  setLastPrompt: (prompt: string) => void;
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
  setStreamingMode: (mode: RoboticsStreamingMode) => void;
  setReasoningActive: (active: boolean) => void;
  setCancelStatus: (
    status: "idle" | "aborting" | "aborted" | "failed_remote",
    message?: string | null
  ) => void;
  /** Guarded stream update — no-op when streamId mismatches or stream is settled. */
  applyForStream: (
    eventStreamId: string,
    patch: Partial<
      Pick<
        RoboticsSessionState,
        | 'streamProgress'
        | 'plan'
        | 'project'
        | 'reasoningActive'
        | 'streamingMode'
        | 'error'
        | 'warning'
        | 'bom'
        | 'incomplete'
      >
    >
  ) => boolean;
  beginGenerate: () => void;
  /**
   * End loading / optionally abort. Does NOT clear streamProgress unless
   * `clearProgress` is true. Does NOT reset activeTab.
   * When `forStreamId` is set and does not match the active stream, only
   * best-effort-aborts that id — does not clear loading/progress of the new stream.
   */
  finalizeStream: (opts?: {
    abortController?: AbortController | null;
    callAbortChat?: boolean;
    /** When true, abort the AbortController (manual Stop only). */
    abortSignal?: boolean;
    /** Clear section progress chrome (only after final commit or reset). */
    clearProgress?: boolean;
    settle?: boolean;
    incomplete?: boolean;
    /** Scope finalize to this stream; stale ids cannot wipe a newer generation. */
    forStreamId?: string | null;
  }) => void;
  /** Clear composer after a successful response (keeps lastPrompt for CAD). */
  clearPromptAfterResponse: () => void;
  resetResults: () => void;
}

export const useRoboticsSessionStore = create<RoboticsSessionState>()((set, get) => ({
  prompt: '',
  lastPrompt: '',
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
  streamingMode: 'idle',
  reasoningActive: false,
  incomplete: false,
  streamSettled: false,
  cancelStatus: "idle",
  cancelMessage: null,

  setPrompt: (prompt) => set({ prompt }),
  setLastPrompt: (lastPrompt) => set({ lastPrompt }),
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
  setStreamingMode: (streamingMode) => set({ streamingMode }),
  setReasoningActive: (reasoningActive) => set({ reasoningActive }),
  setCancelStatus: (cancelStatus, message) =>
    set({ cancelStatus, cancelMessage: message ?? null }),

  applyForStream: (eventStreamId, patch) => {
    const { streamId, streamSettled } = get();
    if (!shouldApplyStreamUpdate(streamId, eventStreamId, streamSettled)) {
      return false;
    }
    set(patch);
    return true;
  },

  beginGenerate: () =>
    set({
      loading: true,
      error: null,
      warning: null,
      bom: null,
      plan: null,
      project: null,
      streamProgress: null,
      // Keep activeTab + userTabLocked — do not force overview.
      streamId: null,
      streamingMode: "streaming",
      reasoningActive: false,
      incomplete: false,
      streamSettled: false,
      cancelStatus: "idle",
      cancelMessage: null,
    }),

  finalizeStream: (opts) => {
    const state = get();
    const scopedId = opts?.forStreamId;

    // Stale stream cleanup: abort that id only — never wipe the active generation.
    if (
      scopedId != null &&
      state.streamId != null &&
      scopedId !== state.streamId
    ) {
      if (opts?.abortSignal && opts.abortController) {
        try {
          opts.abortController.abort();
        } catch {
          /* idempotent */
        }
      }
      if (opts?.callAbortChat !== false) {
        issueAbortChatStreamOnce(scopedId);
      }
      return;
    }

    if (opts?.abortSignal && opts.abortController) {
      try {
        opts.abortController.abort();
      } catch {
        /* idempotent */
      }
    }
    if (opts?.callAbortChat !== false) {
      issueAbortChatStreamOnce(scopedId ?? state.streamId);
    }

    // Never touch activeTab / userTabLocked here.
    set({
      loading: false,
      reasoningActive: false,
      ...(opts?.clearProgress ? { streamProgress: null } : {}),
      ...(opts?.settle
        ? { streamSettled: true, streamId: null, streamingMode: 'idle' as const }
        : {}),
      ...(opts?.incomplete ? { incomplete: true } : {}),
    });
  },

  clearPromptAfterResponse: () => {
    // lastPrompt is set at submit time — only clear the composer UI.
    set({ prompt: '' });
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
      streamingMode: 'idle',
      reasoningActive: false,
      incomplete: false,
      streamSettled: false,
      streamId: null,
      cancelStatus: 'idle',
      cancelMessage: null,
    }),
}));

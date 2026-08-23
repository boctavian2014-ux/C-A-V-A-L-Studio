import { create } from 'zustand';

import type { WorkspaceFileReadErrorCode } from "../../../src/shared/workspace-file-read-contract";

export interface AiWorkCanvasState {
  followAi: boolean;
  editorLoadErrorPath: string | null;
  editorFileReadError: { relativePath: string; code: WorkspaceFileReadErrorCode } | null;
  lastFollowedPath: string | null;
  setFollowAi: (enabled: boolean) => void;
  onStreamStart: () => void;
  onStreamEnd: () => void;
  setEditorLoadErrorPath: (path: string | null) => void;
  setEditorFileReadError: (
    error: { relativePath: string; code: WorkspaceFileReadErrorCode } | null
  ) => void;
  clearEditorFileReadError: () => void;
  setLastFollowedPath: (path: string | null) => void;
}

export const useAiWorkCanvasStore = create<AiWorkCanvasState>((set) => ({
  followAi: false,
  editorLoadErrorPath: null,
  editorFileReadError: null,
  lastFollowedPath: null,

  setFollowAi: (enabled) => set({ followAi: enabled }),

  onStreamStart: () =>
    set({
      followAi: true,
      editorLoadErrorPath: null,
      editorFileReadError: null,
    }),

  onStreamEnd: () => set({ followAi: false }),

  setEditorLoadErrorPath: (path) => set({ editorLoadErrorPath: path }),

  setEditorFileReadError: (error) => set({ editorFileReadError: error }),

  clearEditorFileReadError: () => set({ editorFileReadError: null }),

  setLastFollowedPath: (path) => set({ lastFollowedPath: path }),
}));

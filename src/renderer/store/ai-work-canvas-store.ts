import { create } from 'zustand';

export interface AiWorkCanvasState {
  followAi: boolean;
  editorLoadErrorPath: string | null;
  lastFollowedPath: string | null;
  setFollowAi: (enabled: boolean) => void;
  onStreamStart: () => void;
  onStreamEnd: () => void;
  setEditorLoadErrorPath: (path: string | null) => void;
  setLastFollowedPath: (path: string | null) => void;
}

export const useAiWorkCanvasStore = create<AiWorkCanvasState>((set) => ({
  followAi: false,
  editorLoadErrorPath: null,
  lastFollowedPath: null,

  setFollowAi: (enabled) => set({ followAi: enabled }),

  onStreamStart: () =>
    set({
      followAi: true,
      editorLoadErrorPath: null,
    }),

  onStreamEnd: () => set({ followAi: false }),

  setEditorLoadErrorPath: (path) => set({ editorLoadErrorPath: path }),

  setLastFollowedPath: (path) => set({ lastFollowedPath: path }),
}));

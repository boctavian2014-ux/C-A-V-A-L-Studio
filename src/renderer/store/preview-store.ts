import { create } from "zustand";

import type { PreviewTarget } from "../../shared/preview-contract";

export type PreviewType = PreviewTarget | null;

interface PreviewStore {
  activePreview: PreviewType;
  previewUrl: string | null;
  setActivePreview: (type: PreviewType) => void;
  setPreviewUrl: (url: string | null) => void;
  /** Select target and optionally bind the live URL from the preview launcher. */
  activatePreview: (type: PreviewTarget, url?: string | null) => void;
  clearPreview: () => void;
}

export const usePreviewStore = create<PreviewStore>((set) => ({
  activePreview: null,
  previewUrl: null,
  setActivePreview: (type) => set({ activePreview: type }),
  setPreviewUrl: (url) => set({ previewUrl: url }),
  activatePreview: (type, url) =>
    set({
      activePreview: type,
      previewUrl: url ?? null,
    }),
  clearPreview: () => set({ activePreview: null, previewUrl: null }),
}));

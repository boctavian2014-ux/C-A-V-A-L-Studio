import { create } from "zustand";

import type { PreviewStatus, PreviewTarget } from "../../shared/preview-contract";

export type PreviewType = PreviewTarget | null;

export type PreviewStatusMap = Record<PreviewTarget, PreviewStatus>;

interface PreviewStore {
  activePreview: PreviewType;
  previewUrl: string | null;
  /** When true, content-area preview panel is visible. */
  previewPanelOpen: boolean;
  previewStatus: PreviewStatusMap;
  setActivePreview: (type: PreviewType) => void;
  setPreviewUrl: (url: string | null) => void;
  setPreviewPanelOpen: (open: boolean) => void;
  setPreviewStatus: (target: PreviewTarget, status: PreviewStatus) => void;
  /** Select target and optionally bind the live URL from the preview launcher. */
  activatePreview: (type: PreviewTarget, url?: string | null) => void;
  clearPreview: () => void;
  /** Rail toggle: same target again closes; other target switches. */
  togglePreviewFromRail: (target: PreviewTarget) => void;
}

const defaultStatus: PreviewStatusMap = {
  web: "not-configured",
  mobile: "not-configured",
};

export const usePreviewStore = create<PreviewStore>((set, get) => ({
  activePreview: null,
  previewUrl: null,
  previewPanelOpen: false,
  previewStatus: { ...defaultStatus },
  setActivePreview: (type) => set({ activePreview: type }),
  setPreviewUrl: (url) => set({ previewUrl: url }),
  setPreviewPanelOpen: (open) => set({ previewPanelOpen: open }),
  setPreviewStatus: (target, status) =>
    set((s) => ({
      previewStatus: { ...s.previewStatus, [target]: status },
    })),
  activatePreview: (type, url) =>
    set({
      activePreview: type,
      previewUrl: url ?? null,
      previewPanelOpen: true,
    }),
  clearPreview: () =>
    set({ activePreview: null, previewUrl: null, previewPanelOpen: false }),
  togglePreviewFromRail: (target) => {
    const { activePreview, previewPanelOpen } = get();
    if (previewPanelOpen && activePreview === target) {
      set({ activePreview: null, previewUrl: null, previewPanelOpen: false });
      return;
    }
    set({
      activePreview: target,
      previewUrl: null,
      previewPanelOpen: true,
    });
  },
}));

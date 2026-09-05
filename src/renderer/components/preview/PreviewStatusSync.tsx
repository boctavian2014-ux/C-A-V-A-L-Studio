import { useEffect } from "react";

import type { PreviewTarget } from "../../../shared/preview-contract";
import { usePreviewStore } from "../../store/preview-store";

function revealPreviewFromLauncher(target: PreviewTarget, url: string | null | undefined): void {
  const { previewPanelOpen, activePreview, activatePreview } = usePreviewStore.getState();
  if (previewPanelOpen && activePreview && activePreview !== target) return;
  activatePreview(target, url ?? null);
}

/**
 * Keeps rail badge status in sync even when the content preview panel is closed.
 * Also opens the preview column when the launcher starts from AI tools / palette.
 */
export function PreviewStatusSync(): null {
  const setPreviewStatus = usePreviewStore((s) => s.setPreviewStatus);

  useEffect(() => {
    const api = window.caval?.preview;
    if (!api) {
      setPreviewStatus("web", "not-configured");
      setPreviewStatus("mobile", "not-configured");
      return;
    }

    let cancelled = false;
    const targets: PreviewTarget[] = ["web", "mobile"];

    void Promise.all(
      targets.map(async (target) => {
        try {
          const state = await api.getState(target);
          if (!cancelled) setPreviewStatus(target, state.status);
        } catch {
          if (!cancelled) setPreviewStatus(target, "not-configured");
        }
      })
    );

    const unsub = api.onStateChange((next) => {
      setPreviewStatus(next.target, next.status);
      if (next.status === "starting") {
        revealPreviewFromLauncher(next.target, null);
      } else if (next.status === "running" && next.url) {
        revealPreviewFromLauncher(next.target, next.url);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [setPreviewStatus]);

  return null;
}

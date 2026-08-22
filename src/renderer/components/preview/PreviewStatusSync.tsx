import { useEffect } from "react";

import type { PreviewTarget } from "../../../shared/preview-contract";
import { usePreviewStore } from "../../store/preview-store";

/**
 * Keeps rail badge status in sync even when the content preview panel is closed.
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
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [setPreviewStatus]);

  return null;
}

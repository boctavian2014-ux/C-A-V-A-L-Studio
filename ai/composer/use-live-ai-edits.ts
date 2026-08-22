import { useEffect, useMemo } from "react";

import {
  useLiveAiEditsStore,
  type LiveAiEdit,
  type LiveAiEditEventType,
} from "./live-ai-edits-store";

const EVENT_TYPES: LiveAiEditEventType[] = [
  "ai-edit-start",
  "ai-edit-progress",
  "ai-edit-complete",
  "ai-edit-error",
  "ai-edit-clear",
];

/**
 * Subscribes to live AI edit zustand store (+ optional window events for side-effects).
 * Returns ordered list of files currently touched by the AI stream.
 */
export function useLiveAiEdits(): LiveAiEdit[] {
  const order = useLiveAiEditsStore((s) => s.order);
  const edits = useLiveAiEditsStore((s) => s.edits);
  return useMemo(
    () => order.map((p) => edits[p]).filter(Boolean) as LiveAiEdit[],
    [order, edits]
  );
}

/** Convenience: writing paths only. */
export function useActiveAiEditPaths(): Set<string> {
  const edits = useLiveAiEditsStore((s) => s.edits);
  return useMemo(
    () =>
      new Set(
        Object.values(edits)
          .filter((e) => e.status === "writing")
          .map((e) => e.path)
      ),
    [edits]
  );
}

/** Optional listener for custom side-effects (tests / telemetry). */
export function useLiveAiEditEvents(
  handler: (type: LiveAiEditEventType, detail: { path?: string }) => void
): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const listeners = EVENT_TYPES.map((type) => {
      const fn = (ev: Event) => {
        const detail = (ev as CustomEvent<{ path?: string }>).detail ?? {};
        handler(type, detail);
      };
      window.addEventListener(type, fn);
      return () => window.removeEventListener(type, fn);
    });
    return () => listeners.forEach((off) => off());
  }, [handler]);
}

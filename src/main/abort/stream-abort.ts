import { abortRegisteredStreamController } from "../operation-registry";
import { abortRegistry } from "./abort-registry";
import type { AbortHandle } from "../../shared/abort-contract";

/** streamId (known to renderer) → chat abort root id (internal). */
const streamRoots = new Map<string, string>();

export function startAbortableStream(streamId: string): AbortHandle {
  const existingId = streamRoots.get(streamId);
  if (existingId) {
    const signal = abortRegistry.getSignal(existingId);
    if (signal) {
      return {
        id: existingId,
        scope: "chat",
        parentId: null,
        signal,
        abort: (reason?: string) => {
          abortRegistry.abort(existingId, reason);
        },
        get isAborted() {
          return signal.aborted;
        },
      };
    }
  }

  const root = abortRegistry.create("chat");
  streamRoots.set(streamId, root.id);
  root.signal.addEventListener(
    "abort",
    () => {
      abortRegisteredStreamController(streamId);
    },
    { once: true }
  );
  return root;
}

export function parseAbortStreamId(
  streamId: unknown
): { ok: true; streamId: string } | { ok: false; error: string } {
  if (typeof streamId !== "string" || streamId.length === 0) {
    return { ok: false, error: "Invalid stream id" };
  }
  return { ok: true, streamId };
}

export function getStreamAbortRootId(streamId: string): string | undefined {
  return streamRoots.get(streamId);
}

export function abortAbortableStream(streamId: string, reason = "user cancelled"): boolean {
  const rootId = streamRoots.get(streamId);
  if (!rootId) return false;
  abortRegistry.abort(rootId, reason);
  return true;
}

/** Abort every in-flight chat/NVIDIA/HTTP stream. Safe to call during quit. */
export function abortAllAbortableStreams(reason = "app shutdown"): number {
  let aborted = 0;
  for (const streamId of [...streamRoots.keys()]) {
    if (abortAbortableStream(streamId, reason)) {
      aborted += 1;
    }
  }
  return aborted;
}

export function finishAbortableStream(streamId: string): void {
  const rootId = streamRoots.get(streamId);
  if (rootId) {
    abortRegistry.releaseTree(rootId);
    streamRoots.delete(streamId);
  }
}

/** @internal tests */
export function resetStreamAbortRootsForTests(): void {
  streamRoots.clear();
}

/** @internal tests */
export function streamAbortRootCountForTests(): number {
  return streamRoots.size;
}

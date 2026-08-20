/**
 * M5 abort contract — shared identity for chat, tool-loop, and multi-agent.
 *
 * AbortSignal is in-process only (main / AI pipeline). The renderer talks in
 * serializable ids via AbortApi; it never receives a live signal over IPC.
 */

export type AbortScope = "chat" | "tool-loop" | "multi-agent";

export interface AbortHandleInfo {
  id: string;
  scope: AbortScope;
  parentId: string | null;
  isAborted: boolean;
}

export interface AbortEvent {
  id: string;
  scope: AbortScope;
  reason?: string;
}

/** In-process handle. Do not send `signal` across IPC. */
export interface AbortHandle {
  id: string;
  scope: AbortScope;
  parentId: string | null;
  readonly signal: AbortSignal;
  abort(reason?: string): void;
  readonly isAborted: boolean;
}

/** Future preload/renderer surface — serializable ids only. */
export interface AbortApi {
  create(scope: AbortScope, parentId?: string): Promise<AbortHandleInfo>;
  abort(id: string, reason?: string): Promise<void>;
  isAborted(id: string): Promise<boolean>;
  onAbort(cb: (event: AbortEvent) => void): () => void;
}

/** At most one abortChatStream invoke per streamId (local UI cleanup). */
const issuedChatAborts = new Set<string>();

/** @internal test helper */
export function resetIssuedChatAborts(): void {
  issuedChatAborts.clear();
}

/** @internal test helper */
export function getIssuedChatAbortCount(streamId: string): number {
  return issuedChatAborts.has(streamId) ? 1 : 0;
}

/**
 * Best-effort abortChatStream, once per streamId.
 * P1 does not guarantee main cancels the model (SEC-P2-UNIFIED-ABORT-001).
 */
export function issueAbortChatStreamOnce(streamId: string | null | undefined): boolean {
  if (!streamId) return false;
  if (issuedChatAborts.has(streamId)) return false;
  issuedChatAborts.add(streamId);
  try {
    void window.caval?.abortChatStream?.(streamId);
  } catch {
    /* idempotent */
  }
  return true;
}

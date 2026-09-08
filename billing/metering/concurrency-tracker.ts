/**
 * In-process concurrency trackers for plan limits (PR2).
 * Electron main / billing server share this module when in-process.
 */

const chatStreams = new Map<string, Set<string>>();
const cadReservations = new Map<string, Set<string>>();

export function resetConcurrencyTrackerForTests(): void {
  chatStreams.clear();
  cadReservations.clear();
}

export function trackChatStreamStart(userId: string, streamId: string): void {
  const id = userId.trim() || "anonymous";
  let set = chatStreams.get(id);
  if (!set) {
    set = new Set();
    chatStreams.set(id, set);
  }
  set.add(streamId);
}

export function trackChatStreamEnd(userId: string, streamId: string): void {
  const id = userId.trim() || "anonymous";
  chatStreams.get(id)?.delete(streamId);
}

export function countActiveChatStreams(userId: string): number {
  return chatStreams.get(userId.trim() || "anonymous")?.size ?? 0;
}

export function trackCadReservationStart(userId: string, reservationId: string): void {
  const id = userId.trim() || "anonymous";
  let set = cadReservations.get(id);
  if (!set) {
    set = new Set();
    cadReservations.set(id, set);
  }
  set.add(reservationId);
}

export function trackCadReservationEnd(userId: string, reservationId: string): void {
  const id = userId.trim() || "anonymous";
  cadReservations.get(id)?.delete(reservationId);
}

export function countActiveCadReservations(userId: string): number {
  return cadReservations.get(userId.trim() || "anonymous")?.size ?? 0;
}

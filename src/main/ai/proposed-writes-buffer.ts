/**
 * In-memory proposed writes for a stream/run (Pas 6.4).
 * Cleared on accept/reject/finish.
 */

import type { ProposedWrite } from "../../shared/ai-chat-apply-contract";
import { sanitizeProposedWrites } from "../../shared/ai-chat-apply-contract";

const buffers = new Map<string, ProposedWrite[]>();

export function stageProposedWrites(key: string, writes: ProposedWrite[]): ProposedWrite[] {
  const id = key.trim();
  if (!id) return [];
  const sanitized = sanitizeProposedWrites(writes);
  const existing = buffers.get(id) ?? [];
  const byPath = new Map<string, ProposedWrite>();
  for (const w of existing) byPath.set(w.path, w);
  for (const w of sanitized) byPath.set(w.path, w);
  const merged = [...byPath.values()];
  buffers.set(id, merged);
  return merged;
}

export function getProposedWrites(key: string): ProposedWrite[] {
  return [...(buffers.get(key.trim()) ?? [])];
}

export function clearProposedWrites(key: string): void {
  buffers.delete(key.trim());
}

export function resetProposedWritesForTests(): void {
  buffers.clear();
}

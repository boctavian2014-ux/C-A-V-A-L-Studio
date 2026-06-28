import type { FullDeliveryConfig } from './multi-agent/types';
import { DEFAULT_FULL_DELIVERY_CONFIG } from './multi-agent/types';

export const DEFAULT_FULL_DELIVERY: FullDeliveryConfig = DEFAULT_FULL_DELIVERY_CONFIG;

export interface DeliveryIncompleteInput {
  writtenFiles: string[];
  recap?: string;
  taskCount: number;
  parseSource?: string;
}

function fenceCount(text: string): number {
  return Math.floor((text.match(/```/g)?.length ?? 0) / 2);
}

export function isDeliveryIncomplete(input: DeliveryIncompleteInput): boolean {
  const { writtenFiles, recap, taskCount, parseSource } = input;
  if (writtenFiles.length === 0) return true;
  if (parseSource && fenceCount(parseSource) === 0 && writtenFiles.length < 2) return true;

  const recapLower = (recap ?? '').toLowerCase();
  if (/\bmissing\b|\blips[aă]\b|\bnext step\b|\burm[aă]torul\b|\bincomplete\b/.test(recapLower)) {
    return true;
  }

  const minExpected = Math.max(2, Math.min(taskCount, 5));
  if (taskCount > 0 && writtenFiles.length < minExpected) return true;

  return false;
}

export function canAutoContinueDelivery(
  waveIndex: number,
  config: FullDeliveryConfig = DEFAULT_FULL_DELIVERY
): boolean {
  return config.enabled && config.autoContinue && waveIndex < config.maxComposeWaves;
}

import type { FullDeliveryConfig } from './multi-agent/types';
import { DEFAULT_FULL_DELIVERY_CONFIG } from './multi-agent/types';
import type { CompletionGateResult } from './completion-gate-types';

export const DEFAULT_FULL_DELIVERY: FullDeliveryConfig = DEFAULT_FULL_DELIVERY_CONFIG;

export interface DeliveryIncompleteInput {
  writtenFiles: string[];
  recap?: string;
  taskCount: number;
  moduleHintCount?: number;
  parseSource?: string;
}

function fenceCount(text: string): number {
  return Math.floor((text.match(/```/g)?.length ?? 0) / 2);
}

export function isDeliveryIncomplete(input: DeliveryIncompleteInput): boolean {
  const { writtenFiles, recap, taskCount, moduleHintCount, parseSource } = input;
  if (writtenFiles.length === 0) return true;
  if (parseSource && fenceCount(parseSource) === 0 && writtenFiles.length < 2) return true;

  const recapLower = (recap ?? '').toLowerCase();
  if (/\bmissing\b|\blips[aă]\b|\bnext step\b|\burm[aă]torul\b|\bincomplete\b/.test(recapLower)) {
    return true;
  }

  const effectiveTasks = Math.max(taskCount, moduleHintCount ? Math.ceil(moduleHintCount / 3) : 0);
  const minExpected = Math.max(3, Math.min(Math.max(effectiveTasks, taskCount) * 2, 12));
  if (effectiveTasks > 0 && writtenFiles.length < minExpected) return true;

  return false;
}

export function isDeliveryIncompleteFromGate(gate: CompletionGateResult | undefined): boolean {
  return gate != null && !gate.ok;
}

export function isDeliveryBlocked(
  input: DeliveryIncompleteInput,
  gate?: CompletionGateResult,
  arenaIssues?: Array<{ severity: string }>
): boolean {
  if (isDeliveryIncompleteFromGate(gate)) return true;
  const hasBlockingArena = (arenaIssues ?? []).some(
    (i) => i.severity === 'critical' || i.severity === 'major'
  );
  if (hasBlockingArena && gate && !gate.ok) return true;
  return isDeliveryIncomplete(input);
}

export function canAutoContinueDelivery(
  waveIndex: number,
  config: FullDeliveryConfig = DEFAULT_FULL_DELIVERY
): boolean {
  return config.enabled && config.autoContinue && waveIndex < config.maxComposeWaves;
}

export function canAutoContinueRepair(
  repairWaveIndex: number,
  config: FullDeliveryConfig = DEFAULT_FULL_DELIVERY
): boolean {
  return (
    config.enabled &&
    config.autonomousFinish &&
    config.autoContinue &&
    repairWaveIndex < config.maxRepairWaves
  );
}

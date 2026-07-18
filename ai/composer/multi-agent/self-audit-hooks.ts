import fs from 'node:fs';
import path from 'node:path';

import type { MultiAgentConfig, SubAgentResult, SupervisorResult } from './types';
import type { PipelineMemoryEngine } from './pipeline-memory';
import {
  formatCapabilityMapForOrchestrator,
  loadCapabilityMap,
  saveCapabilityMap,
  snapshotCapabilityMap,
  updateFromSubAgentResult,
  updateFromSupervisor,
  type CapabilityMapRecord,
} from './capability-profile';
import { formatSelfAuditBadge, parseSelfAuditOutput } from './self-audit-parser';
import type { MultiAgentPipelineCallbacks } from './types';

export interface SelfAuditRunContext {
  capabilityMap: CapabilityMapRecord;
  selfAuditSummary?: string;
}

export function initSelfAuditRun(workspaceRoot: string): SelfAuditRunContext {
  return { capabilityMap: loadCapabilityMap(workspaceRoot) };
}

export function getCapabilityHintForOrchestrator(ctx: SelfAuditRunContext): string {
  return formatCapabilityMapForOrchestrator(ctx.capabilityMap);
}

export function processSubAgentSelfAudits(
  ctx: SelfAuditRunContext,
  results: SubAgentResult[],
  config: MultiAgentConfig,
  callbacks?: MultiAgentPipelineCallbacks
): void {
  if (config.selfAudit?.enabled === false) return;
  const useProgrammatic = config.selfAudit?.useProgrammaticScores !== false;

  for (const result of results) {
    const parsed = parseSelfAuditOutput(result.output);
    updateFromSubAgentResult(ctx.capabilityMap, result, {
      useProgrammaticScores: useProgrammatic,
      parsedAudit: parsed,
    });

    const badge = formatSelfAuditBadge(parsed, result.ok);
    if (badge) {
      callbacks?.onMultiAgentStatus?.(
        'subagent',
        'done',
        undefined,
        result.modelId,
        `subagent-${result.taskId}`,
        badge
      );
    }
  }
}

export function processSupervisorSelfAudit(
  ctx: SelfAuditRunContext,
  supervisor: SupervisorResult,
  taskModelMap: Record<string, string>,
  config: MultiAgentConfig,
  callbacks?: MultiAgentPipelineCallbacks
): void {
  if (config.selfAudit?.enabled === false) return;

  updateFromSupervisor(ctx.capabilityMap, supervisor, taskModelMap);

  const parsed = parseSelfAuditOutput(supervisor.raw);
  const badge = formatSelfAuditBadge(parsed, supervisor.approved);
  if (badge) {
    callbacks?.onMultiAgentStatus?.('supervisor', 'done', undefined, undefined, 'supervisor', badge);
  }

  if (parsed?.improveRule) {
    ctx.selfAuditSummary = parsed.improveRule;
  } else if (supervisor.summary) {
    ctx.selfAuditSummary = supervisor.summary.slice(0, 200);
  }
}

export function persistSelfAuditArtifacts(
  workspaceRoot: string,
  runId: string,
  ctx: SelfAuditRunContext,
  config: MultiAgentConfig,
  memoryEngine?: PipelineMemoryEngine
): void {
  if (config.selfAudit?.enabled === false) return;

  saveCapabilityMap(workspaceRoot, ctx.capabilityMap);

  if (ctx.selfAuditSummary && memoryEngine) {
    memoryEngine.appendPreference(`selfImproveRule:${runId}`, ctx.selfAuditSummary);
  }

  if (!config.selfAudit?.persistReports || !config.persistArtifacts) return;

  const dir = path.join(workspaceRoot, '.cavalo', 'pipeline', runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'capability-map.json'),
    JSON.stringify(snapshotCapabilityMap(ctx.capabilityMap), null, 2)
  );
  if (ctx.selfAuditSummary) {
    fs.writeFileSync(path.join(dir, 'self-audit-summary.md'), ctx.selfAuditSummary);
  }
}

export function selfAuditRecapFields(ctx: SelfAuditRunContext): {
  capabilitySnapshot: ReturnType<typeof snapshotCapabilityMap>;
  selfAuditSummary?: string;
} {
  return {
    capabilitySnapshot: snapshotCapabilityMap(ctx.capabilityMap),
    selfAuditSummary: ctx.selfAuditSummary,
  };
}

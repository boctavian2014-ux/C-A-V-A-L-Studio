import fs from 'node:fs';
import path from 'node:path';

import type { SubAgentResult, SupervisorResult } from './types';
import { parseSelfAuditOutput, type ParsedSelfAudit } from './self-audit-parser';

export interface ModelCapabilityProfile {
  modelId: string;
  reasoning: number;
  coding: number;
  planning: number;
  toolUse: number;
  taskSuccessRate: number;
  failureModes: string[];
  runs: number;
  updatedAt: number;
}

export interface CapabilityMapRecord {
  version: 1;
  updatedAt: number;
  models: Record<string, ModelCapabilityProfile>;
}

const EMA_ALPHA = 0.3;
const DEFAULT_SCORE = 50;
const MAX_FAILURE_MODES = 5;

function capabilityMapPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.cavalo', 'memory', 'capability-map.json');
}

function ema(current: number, sample: number): number {
  return Math.round(current * (1 - EMA_ALPHA) + sample * EMA_ALPHA);
}

function defaultProfile(modelId: string): ModelCapabilityProfile {
  const now = Date.now();
  return {
    modelId,
    reasoning: DEFAULT_SCORE,
    coding: DEFAULT_SCORE,
    planning: DEFAULT_SCORE,
    toolUse: DEFAULT_SCORE,
    taskSuccessRate: DEFAULT_SCORE,
    failureModes: [],
    runs: 0,
    updatedAt: now,
  };
}

function countFences(text: string): number {
  return (text.match(/```[\w-]*:[^\n`]+/g) ?? []).length;
}

function mergeFailureModes(existing: string[], incoming: string[]): string[] {
  const set = new Set<string>();
  for (const m of [...incoming, ...existing]) {
    const t = m.trim();
    if (t) set.add(t.slice(0, 120));
  }
  return [...set].slice(0, MAX_FAILURE_MODES);
}

export function loadCapabilityMap(workspaceRoot: string): CapabilityMapRecord {
  const filePath = capabilityMapPath(workspaceRoot);
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CapabilityMapRecord;
      if (parsed.version === 1 && parsed.models) return parsed;
    }
  } catch {
    // fresh map
  }
  return { version: 1, updatedAt: Date.now(), models: {} };
}

export function saveCapabilityMap(workspaceRoot: string, record: CapabilityMapRecord): void {
  record.updatedAt = Date.now();
  const dir = path.dirname(capabilityMapPath(workspaceRoot));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(capabilityMapPath(workspaceRoot), JSON.stringify(record, null, 2));
}

function getOrCreate(record: CapabilityMapRecord, modelId: string): ModelCapabilityProfile {
  if (!record.models[modelId]) {
    record.models[modelId] = defaultProfile(modelId);
  }
  return record.models[modelId]!;
}

function applyAuditScores(profile: ModelCapabilityProfile, audit: ParsedSelfAudit | null): void {
  if (!audit?.scores) return;
  const s = audit.scores;
  if (s.reasoning != null) profile.reasoning = ema(profile.reasoning, s.reasoning);
  if (s.coding != null) profile.coding = ema(profile.coding, s.coding);
  if (s.planning != null) profile.planning = ema(profile.planning, s.planning);
  if (s.toolUse != null) profile.toolUse = ema(profile.toolUse, s.toolUse);
  if (s.failureModes?.length) {
    profile.failureModes = mergeFailureModes(profile.failureModes, s.failureModes);
  }
}

export function updateFromSubAgentResult(
  record: CapabilityMapRecord,
  result: SubAgentResult,
  opts?: { useProgrammaticScores?: boolean; parsedAudit?: ParsedSelfAudit | null }
): ModelCapabilityProfile {
  const profile = getOrCreate(record, result.modelId);
  const audit = opts?.parsedAudit ?? parseSelfAuditOutput(result.output);
  const fences = countFences(result.output);
  const taskOk = result.ok && fences > 0;

  profile.runs += 1;
  profile.updatedAt = Date.now();

  if (opts?.useProgrammaticScores !== false) {
    const successSample = taskOk ? 85 : result.ok ? 60 : 25;
    profile.taskSuccessRate = ema(profile.taskSuccessRate, successSample);
    if (taskOk) profile.coding = ema(profile.coding, Math.min(95, 70 + fences * 3));
    else if (!result.ok) profile.coding = ema(profile.coding, 30);

    if (audit?.toolUseAccuracy != null) {
      profile.toolUse = ema(profile.toolUse, audit.toolUseAccuracy);
    } else if (!result.ok) {
      profile.toolUse = ema(profile.toolUse, 35);
    }

    if (audit?.trajectoryEfficiency != null) {
      profile.planning = ema(profile.planning, audit.trajectoryEfficiency);
    }
  }

  applyAuditScores(profile, audit);

  if (audit?.topFailureMode) {
    profile.failureModes = mergeFailureModes(profile.failureModes, [audit.topFailureMode]);
  }
  if (!result.ok && result.error) {
    profile.failureModes = mergeFailureModes(profile.failureModes, [result.error]);
  }

  return profile;
}

export function updateFromSupervisor(
  record: CapabilityMapRecord,
  supervisor: SupervisorResult,
  taskModelMap: Record<string, string>
): void {
  for (const issue of supervisor.issues) {
    if (issue.severity !== 'critical' && issue.severity !== 'major') continue;
    const modelId =
      (issue.taskId && taskModelMap[issue.taskId]) ||
      Object.values(taskModelMap)[0];
    if (!modelId) continue;
    const profile = getOrCreate(record, modelId);
    profile.runs += 1;
    profile.taskSuccessRate = ema(profile.taskSuccessRate, issue.severity === 'critical' ? 20 : 35);
    profile.coding = ema(profile.coding, issue.severity === 'critical' ? 25 : 40);
    profile.failureModes = mergeFailureModes(profile.failureModes, [issue.message]);
    profile.updatedAt = Date.now();
  }
}

export function formatCapabilityMapForOrchestrator(record: CapabilityMapRecord): string {
  const entries = Object.values(record.models)
    .filter((p) => p.runs > 0)
    .sort((a, b) => b.runs - a.runs)
    .slice(0, 8);
  if (entries.length === 0) return '';

  const lines = entries.map(
    (p) =>
      `- ${p.modelId}: reasoning=${p.reasoning}% coding=${p.coding}% planning=${p.planning}% toolUse=${p.toolUse}% (runs=${p.runs})`
  );
  return [
    '**Capability map (historical — delegate to highest score per task type):**',
    ...lines,
  ].join('\n');
}

export function snapshotCapabilityMap(
  record: CapabilityMapRecord
): Record<string, Pick<ModelCapabilityProfile, 'reasoning' | 'coding' | 'planning' | 'toolUse'>> {
  const out: Record<string, Pick<ModelCapabilityProfile, 'reasoning' | 'coding' | 'planning' | 'toolUse'>> = {};
  for (const [id, p] of Object.entries(record.models)) {
    if (p.runs === 0) continue;
    out[id] = {
      reasoning: p.reasoning,
      coding: p.coding,
      planning: p.planning,
      toolUse: p.toolUse,
    };
  }
  return out;
}

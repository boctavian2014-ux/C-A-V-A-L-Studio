import fs from 'node:fs';
import path from 'node:path';

import type {
  ExecutionPlan,
  PipelineContext,
  PipelineTask,
  ReasoningBrief,
  SubAgentResult,
} from './types';

export interface PipelineCheckpoint {
  runId: string;
  streamId: string;
  workspaceRoot: string;
  model: string;
  strictReview?: boolean;
  userMessage: string;
  decompositionRaw: string;
  tasks: PipelineTask[];
  uiTasks: PipelineTask[];
  preUiResults: SubAgentResult[];
  plan: ExecutionPlan;
  context: PipelineContext;
  subAgentOutputs: Record<string, string>;
  reasoningBrief?: ReasoningBrief;
}

const memoryCheckpoints = new Map<string, PipelineCheckpoint>();

export function rememberCheckpoint(cp: PipelineCheckpoint): void {
  memoryCheckpoints.set(cp.runId, cp);
  persistCheckpoint(cp);
}

export function getCheckpoint(runId: string): PipelineCheckpoint | undefined {
  return memoryCheckpoints.get(runId);
}

export function loadCheckpointFromDisk(workspaceRoot: string, runId: string): PipelineCheckpoint | null {
  try {
    const file = path.join(workspaceRoot, '.cavalo', 'pipeline', runId, 'checkpoint.json');
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as PipelineCheckpoint;
    memoryCheckpoints.set(runId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function persistCheckpoint(cp: PipelineCheckpoint): void {
  try {
    const dir = path.join(cp.workspaceRoot, '.cavalo', 'pipeline', cp.runId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'checkpoint.json'), JSON.stringify(cp, null, 2));
  } catch {
    /* non-fatal */
  }
}

export function clearCheckpoint(runId: string): void {
  memoryCheckpoints.delete(runId);
}

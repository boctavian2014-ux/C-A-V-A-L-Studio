import { fastPipelineRecapLabel } from '../pipeline/fast-pipeline';
import type { DevToolsIntegrationResult, PipelineContext, SupervisorResult } from './multi-agent/types';
import type { PipelineTask } from './multi-agent/types';

export interface ReasoningBrief {
  goal: string;
  approach: string;
  modules: string[];
}

export interface RecapInput {
  brief: ReasoningBrief;
  writtenFiles: string[];
  taskCount: number;
  supervisor?: SupervisorResult;
  pendingIssues?: string[];
  devTools?: DevToolsIntegrationResult;
  fastPipeline?: boolean;
}

function extractSection(raw: string, heading: string): string {
  const re = new RegExp(
    `\\*\\*${heading}:\\*\\*\\s*([^\\n]+(?:\\n(?!\\*\\*)[^\\n]+)*)`,
    'i'
  );
  const m = raw.match(re);
  return m?.[1]?.trim().replace(/\s+/g, ' ').slice(0, 280) ?? '';
}

export function parseReasoningFromDecomposition(
  raw: string,
  userMessage: string,
  tasks: PipelineTask[] = []
): ReasoningBrief {
  const goal =
    extractSection(raw, 'Project Goal') ||
    userMessage.trim().slice(0, 200) ||
    'Implement user request';
  const approach =
    extractSection(raw, 'High-Level Architecture') ||
    (tasks.length > 0
      ? `${tasks.length} module(s): ${tasks.map((t) => t.module).join(', ')}`
      : 'Modular implementation under workspace root');
  const modules = tasks.length > 0 ? tasks.map((t) => t.module) : [];

  return { goal, approach, modules };
}

export function buildEarlyArenaMessage(brief: ReasoningBrief, continuing = false): string {
  const base = [`Goal: ${brief.goal}`, `Plan: ${brief.approach}`].join('\n');
  return continuing ? `${base}\n· continuă delivery…` : base;
}

export function buildFinalRecap(input: RecapInput): string {
  const files = input.writtenFiles;
  const fileList = files.slice(0, 3).join(', ');
  const fileSuffix = files.length > 3 ? '…' : '';

  const implemented =
    files.length > 0
      ? `Implementat: ${files.length} fișier(e)${fileList ? ` (${fileList}${fileSuffix})` : ''}`
      : 'Implementat: vezi editorul';

  const pipelineLabel = fastPipelineRecapLabel(input.fastPipeline ? 'fast' : 'full');
  const sup =
    input.fastPipeline && input.supervisor?.raw === 'FAST_PIPELINE'
      ? pipelineLabel
      : (input.supervisor?.summary ?? 'review skipped');
  const decisions = `Decizii: ${pipelineLabel} · ${input.taskCount} module · ${sup}`;

  const pending = input.pendingIssues?.filter(Boolean) ?? [];
  const missing =
    pending.length > 0 ? `Pending: ${pending.slice(0, 2).join('; ')}` : '';

  const nextParts: string[] = [];
  if (input.devTools?.terminal?.testScript) {
    nextParts.push('npm test');
  }
  if (input.devTools?.terminal?.buildScript) {
    nextParts.push('npm run build');
  }
  if (input.devTools?.git?.isRepo && (input.devTools.git.changedFiles ?? 0) > 0) {
    nextParts.push('git commit');
  }
  const next =
    nextParts.length > 0 ? `Next: ${nextParts.join(' → ')}` : 'Next: verifică fișierele în editor';

  return [implemented, decisions, missing, next].filter(Boolean).join('\n');
}

export function formatReasoningMarkdown(brief: ReasoningBrief, recap?: string): string {
  const lines = [
    '**Step 1: Understanding**',
    brief.goal,
    '',
    '**Step 2: Approach**',
    brief.approach,
  ];
  if (brief.modules.length) {
    lines.push('', '**Modules**', brief.modules.join(', '));
  }
  if (recap) {
    lines.push('', '**Step 4: Recap**', recap);
  }
  return lines.join('\n');
}

export function briefFromContext(userMessage: string, context?: PipelineContext): ReasoningBrief {
  return {
    goal: context?.userIntent || userMessage.slice(0, 200),
    approach: context?.architectureContext?.slice(0, 200) || 'Direct implementation',
    modules: [],
  };
}

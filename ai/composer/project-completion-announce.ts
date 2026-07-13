import { buildFinalRecap, briefFromContext, type ReasoningBrief } from './reasoning-brief';
import type { PipelineRecapMeta } from './multi-agent/types';

export interface ProjectCompletionRecapInput {
  projectTitle: string;
  writtenFiles: string[];
  userMessage?: string;
  brief?: ReasoningBrief;
  recapMeta?: PipelineRecapMeta;
  needsReview?: boolean;
  verifyPending?: boolean;
}

export function formatProjectCompletionWaitMessage(
  projectTitle: string,
  fileCount: number,
  needsReview = false
): string {
  const label = projectTitle.trim() || 'proiect';
  if (needsReview) {
    return `${label} — livrat cu [NEEDS_REVIEW] (${fileCount} fișier(e))`;
  }
  return `${label} gata — ${fileCount} fișier(e) scrise`;
}

export function buildProjectCompletionToast(input: {
  projectTitle: string;
  writtenFiles: string[];
  needsReview?: boolean;
  verifyPending?: boolean;
}): string {
  const name = input.projectTitle.trim() || 'Proiect';
  const count = input.writtenFiles.length;
  if (input.needsReview) {
    return `Proiect ${name} — [NEEDS_REVIEW]`;
  }
  if (input.verifyPending) {
    return `Proiect ${name} — verify în background`;
  }
  return `Proiect ${name} finalizat — ${count} fișier(e)`;
}

export function buildProjectCompletionRecap(input: ProjectCompletionRecapInput): string {
  const brief =
    input.brief ??
    (input.userMessage ? briefFromContext(input.userMessage) : undefined) ?? {
      goal: 'Implement user request',
      approach: 'Agentic delivery',
      modules: [],
    };

  const body = buildFinalRecap({
    brief,
    writtenFiles: input.writtenFiles,
    taskCount: input.recapMeta?.taskCount ?? 0,
    supervisor: input.recapMeta?.supervisor,
    pendingIssues: input.recapMeta?.pendingIssues,
    devTools: input.recapMeta?.devTools,
    fastPipeline: input.recapMeta?.fastPipeline,
  });

  const lines = [`Proiect: ${input.projectTitle.trim() || 'workspace'}`, body];
  if (input.verifyPending) {
    lines.push('⏳ Verify în background…');
  } else if (!input.needsReview && input.writtenFiles.length > 0) {
    lines.push('✓ Gata');
  }
  return lines.filter(Boolean).join('\n');
}

export interface PipelineVerifyTarget {
  id: string;
  workspacePath?: string;
  streamId?: string;
  pipelineRunId?: string;
  role: 'user' | 'assistant';
}

export function findPipelineVerifyTargetMessage(
  messages: PipelineVerifyTarget[],
  payload: { workspaceRoot?: string; streamId?: string; runId: string },
  currentProjectPath: string | null
): PipelineVerifyTarget | undefined {
  if (
    payload.workspaceRoot &&
    currentProjectPath &&
    payload.workspaceRoot !== currentProjectPath
  ) {
    return undefined;
  }

  const assistants = messages.filter((m) => m.role === 'assistant');

  if (payload.streamId) {
    const byStream = assistants.find((m) => m.streamId === payload.streamId);
    if (byStream) return byStream;
  }

  if (payload.runId) {
    const byRun = assistants.find((m) => m.pipelineRunId === payload.runId);
    if (byRun) return byRun;
  }

  return [...assistants]
    .reverse()
    .find((m) => !m.workspacePath || m.workspacePath === currentProjectPath);
}

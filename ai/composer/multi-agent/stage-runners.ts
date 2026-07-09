import { completeModelText, executeModelCompletion } from '../../pipeline/model-completion';
import type { CompletionMessage } from '../../pipeline/model-completion';
import {
  DECOMPOSITION_AGENT_PROMPT,
  FINAL_COMPOSER_WITH_REASONING,
  MERGE_AGENT_PROMPT,
  PIPELINE_CONTEXT_AGENT_PROMPT,
  SUB_AGENT_PROMPT,
  SUPERVISOR_AGENT_PROMPT,
} from '../../prompts/multi-agent';
import { SCAFFOLD_EMISSION_RULE } from '../../prompts/scaffold-emission-rule';
import { FULL_DELIVERY_RULE } from '../../prompts/full-delivery-rule';
import type { ModelSelectionId } from '../../models/model-catalog';
import { parseSupervisorOutput } from './supervisor-parser';
import { parseDecomposition, isDecompositionCollapsed } from './decomposition-parser';
import { PipelineContextStore } from './pipeline-context-store';
import { ModelRotator } from './orchestrator';
import type {
  ExecutionPlan,
  MultiAgentConfig,
  MultiAgentPipelineCallbacks,
  MultiAgentStageId,
  PipelineTask,
  SubAgentResult,
  SupervisorResult,
} from './types';

export const SCAFFOLD_SYSTEM_ADDON = [
  '',
  'SCAFFOLD MODE:',
  '- Create a minimal but runnable project structure under the workspace root.',
  '- Output each file as a fenced block: ```lang:relative/path with FULL source.',
  '- Include README.md, docs/requirements.md, docs/architecture.md for complex projects.',
  '- Include tests, CI/CD configs (Dockerfile, .github/workflows), deployment notes when relevant.',
  '- Emit ALL modules from the plan — do not stop after the first batch of files.',
  '- Each sub-agent output must use ```lang:relative/path``` fences with FULL source.',
  FULL_DELIVERY_RULE,
  SCAFFOLD_EMISSION_RULE,
].join('\n');

function wrapUser(content: string): string {
  return `<<USER_MESSAGE>>\n${content}\n<</USER_MESSAGE>>`;
}

async function runComplete(
  model: ModelSelectionId,
  system: string,
  user: string,
  opts: {
    capability: 'planning' | 'code' | 'debug' | 'chat';
    intent?: 'planning' | 'kilocode' | 'debug';
    workspaceRoot?: string;
    requestId?: string;
    callbacks?: MultiAgentPipelineCallbacks;
    maxTokens?: number;
    timeoutMs?: number;
  }
): Promise<{ ok: true; text: string; model: string } | { ok: false; error: string }> {
  const messages: CompletionMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: wrapUser(user) },
  ];

  const result = await completeModelText({
    model,
    messages,
    capability: opts.capability,
    intent: opts.intent ?? (opts.capability === 'planning' ? 'planning' : 'kilocode'),
    workspaceRoot: opts.workspaceRoot,
    requestId: opts.requestId,
    useTools: false,
    maxTokens: opts.maxTokens ?? (opts.capability === 'code' ? 8192 : 2048),
    timeoutMs: opts.timeoutMs ?? (opts.capability === 'planning' ? 90_000 : 120_000),
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  opts.callbacks?.onMeta?.(result.resolvedModel, 'multi-agent stage');
  return { ok: true, text: result.text, model: result.resolvedModel };
}

export async function runContextCapture(
  model: ModelSelectionId,
  userMessage: string,
  projectContext: string | undefined,
  workspaceRoot: string,
  callbacks?: MultiAgentPipelineCallbacks,
  skipLlm = true
): Promise<PipelineContextStore> {
  emitStage(callbacks, 'context', 'active');

  if (skipLlm) {
    emitStage(callbacks, 'context', 'done', 'instant');
    const slice = projectContext ? projectContext.slice(0, 16_000) : undefined;
    return PipelineContextStore.createFallback(userMessage, slice);
  }

  const user = [
    userMessage,
    projectContext ? `\n\nExisting project context:\n${projectContext.slice(0, 8000)}` : '',
  ].join('');

  const result = await runComplete(model, PIPELINE_CONTEXT_AGENT_PROMPT, user, {
    capability: 'planning',
    intent: 'planning',
    workspaceRoot,
    requestId: 'ma-context',
    callbacks,
  });

  emitStage(callbacks, 'context', 'done');

  if (result.ok) {
    return PipelineContextStore.fromAgentOutput(result.text, userMessage, projectContext);
  }
  return PipelineContextStore.createFallback(userMessage, projectContext);
}

const DECOMPOSITION_RETRY_ADDON = `

CRITICAL FORMAT (required for parsing):
- Use lines exactly like: - Task 1.1: description
- Use lines exactly like: - Module 1: name + purpose
- Emit at least 4 Task lines across 2+ modules.
- Do NOT use only bold bullets without "Task" prefix.`;

export async function runDecomposition(
  model: ModelSelectionId,
  store: PipelineContextStore,
  config: MultiAgentConfig,
  workspaceRoot: string,
  callbacks?: MultiAgentPipelineCallbacks
): Promise<{ tasks: PipelineTask[]; raw: string } | { error: string }> {
  emitStage(callbacks, 'decompose', 'active');
  const result = await runComplete(model, DECOMPOSITION_AGENT_PROMPT, store.buildPromptFor('decompose'), {
    capability: 'planning',
    intent: 'planning',
    workspaceRoot,
    requestId: 'ma-decompose',
    callbacks,
    maxTokens: config.decompositionMaxTokens,
    timeoutMs: 120_000,
  });

  if (!result.ok) {
    emitStage(callbacks, 'decompose', 'done', 'failed');
    return { error: result.error };
  }

  let raw = result.text;
  let tasks = parseDecomposition(raw, config.maxTasks);

  if (config.antiCollapseDecomposition && isDecompositionCollapsed(raw, tasks)) {
    emitStage(callbacks, 'decompose', 'active', 'retry (anti-collapse)');
    const retry = await runComplete(
      model,
      DECOMPOSITION_AGENT_PROMPT + DECOMPOSITION_RETRY_ADDON,
      store.buildPromptFor('decompose'),
      {
        capability: 'planning',
        intent: 'planning',
        workspaceRoot,
        requestId: 'ma-decompose-retry',
        callbacks,
        maxTokens: config.decompositionMaxTokens,
        timeoutMs: 120_000,
      }
    );
    if (retry.ok) {
      const retryTasks = parseDecomposition(retry.text, config.maxTasks);
      if (retryTasks.length > tasks.length) {
        raw = retry.text;
        tasks = retryTasks;
      }
    }
  }

  store.setDecompositionRaw(raw);
  store.setTasks(tasks);
  emitStage(callbacks, 'decompose', 'done', `${tasks.length} tasks`);
  return { tasks, raw };
}

async function runOneSubAgent(
  task: PipelineTask,
  modelId: string,
  store: PipelineContextStore,
  workspaceRoot: string,
  rotator: ModelRotator,
  callbacks?: MultiAgentPipelineCallbacks
): Promise<SubAgentResult> {
  const result = await runComplete(modelId as ModelSelectionId, SUB_AGENT_PROMPT, store.buildPromptFor('subagent-task', task), {
    capability: 'code',
    intent: 'kilocode',
    workspaceRoot,
    requestId: `ma-sub-${task.id}`,
    callbacks,
  });

  if (result.ok && result.text.trim()) {
    store.setSubAgentOutput(task.id, result.text);
    return { taskId: task.id, modelId: result.model, output: result.text, ok: true };
  }

  const retryModel = rotator.next(modelId);
  const retry = await runComplete(retryModel as ModelSelectionId, SUB_AGENT_PROMPT, store.buildPromptFor('subagent-task', task), {
    capability: 'code',
    intent: 'kilocode',
    workspaceRoot,
    requestId: `ma-sub-retry-${task.id}`,
    callbacks,
  });

  if (retry.ok && retry.text.trim()) {
    store.setSubAgentOutput(task.id, retry.text);
    return { taskId: task.id, modelId: retry.model, output: retry.text, ok: true };
  }

  const err = retry.ok ? 'Empty output' : retry.error;
  store.addPendingIssues([`Sub-agent ${task.id} failed: ${err}`]);
  return { taskId: task.id, modelId: retryModel, output: '', ok: false, error: err };
}

export async function runSubAgents(
  tasks: PipelineTask[],
  plan: ExecutionPlan,
  store: PipelineContextStore,
  config: MultiAgentConfig,
  workspaceRoot: string,
  rotator: ModelRotator,
  callbacks?: MultiAgentPipelineCallbacks,
  isAborted?: () => boolean
): Promise<SubAgentResult[]> {
  const results: SubAgentResult[] = [];
  const queue = [...tasks];
  let completed = 0;

  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      if (isAborted?.()) return;
      const task = queue.shift();
      if (!task) return;

      emitStage(
        callbacks,
        'subagent',
        'active',
        `${completed + 1}/${tasks.length} · ${task.module}`
      );

      const modelId = plan.taskDistributionMap[task.id] ?? rotator.next();
      const result = await runOneSubAgent(task, modelId, store, workspaceRoot, rotator, callbacks);
      results.push(result);
      completed += 1;
    }
  };

  const workers = Array.from({ length: Math.min(config.parallelSubAgents, tasks.length) }, () =>
    worker()
  );
  await Promise.all(workers);

  emitStage(callbacks, 'subagent', 'done', `${results.filter((r) => r.ok).length}/${tasks.length} ok`);
  return results;
}

export async function runMerge(
  model: ModelSelectionId,
  store: PipelineContextStore,
  workspaceRoot: string,
  callbacks?: MultiAgentPipelineCallbacks
): Promise<{ raw: string } | { error: string }> {
  emitStage(callbacks, 'merge', 'active');
  const result = await runComplete(model, MERGE_AGENT_PROMPT, store.buildPromptFor('merge'), {
    capability: 'planning',
    intent: 'planning',
    workspaceRoot,
    requestId: 'ma-merge',
    callbacks,
  });

  if (!result.ok) {
    emitStage(callbacks, 'merge', 'done', 'failed');
    return { error: result.error };
  }

  store.setMergeRaw(result.text);
  emitStage(callbacks, 'merge', 'done');
  return { raw: result.text };
}

export async function runSupervisor(
  model: ModelSelectionId,
  store: PipelineContextStore,
  workspaceRoot: string,
  callbacks?: MultiAgentPipelineCallbacks
): Promise<SupervisorResult | { error: string }> {
  emitStage(callbacks, 'supervisor', 'active');
  const result = await runComplete(model, SUPERVISOR_AGENT_PROMPT, store.buildPromptFor('supervisor'), {
    capability: 'debug',
    intent: 'debug',
    workspaceRoot,
    requestId: 'ma-supervisor',
    callbacks,
  });

  if (!result.ok) {
    emitStage(callbacks, 'supervisor', 'done', 'failed');
    return { error: result.error };
  }

  const parsed = parseSupervisorOutput(result.text);
  store.setSupervisorIssues(parsed.issues.map((i) => `[${i.severity}] ${i.message}`));
  emitStage(callbacks, 'supervisor', 'done', parsed.approved ? 'approved' : 'rejected');
  return parsed;
}

export async function runFinalComposer(
  model: ModelSelectionId,
  store: PipelineContextStore,
  workspaceRoot: string,
  callbacks?: MultiAgentPipelineCallbacks,
  isAborted?: () => boolean,
  opts?: { waveIndex?: number }
): Promise<{ ok: true; text: string; model: string; provider: string } | { ok: false; error: string }> {
  emitStage(callbacks, 'compose', 'active', opts?.waveIndex ? `wave ${opts.waveIndex + 1}` : undefined);
  const system = `${FINAL_COMPOSER_WITH_REASONING}\n${SCAFFOLD_SYSTEM_ADDON}`;
  let user = store.buildPromptFor('compose');
  if (opts?.waveIndex && opts.waveIndex > 0) {
    user += `\n\n## DELIVERY WAVE ${opts.waveIndex + 1}\nComplete ALL missing files from the plan. Emit every remaining file as \`\`\`lang:path\`\`\` fences with full source. Do not repeat explanations.`;
  }

  const messages: CompletionMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: wrapUser(user) },
  ];

  const result = await executeModelCompletion(
    {
      model,
      messages,
      capability: 'code',
      intent: 'kilocode',
      workspaceRoot,
      requestId: opts?.waveIndex ? `ma-compose-w${opts.waveIndex}` : 'ma-compose',
      useTools: false,
      maxTokens: 16_384,
    },
    {
      onMeta: callbacks?.onMeta,
      onDelta: (delta) => {
        if (!isAborted?.()) callbacks?.onDelta?.(delta);
      },
      onReasoning: callbacks?.onReasoning,
      onStatus: callbacks?.onStatus,
    }
  );

  emitStage(callbacks, 'compose', 'done');

  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return {
    ok: true,
    text: result.text,
    model: result.resolvedModel,
    provider: result.provider,
  };
}

export async function runTargetedSubAgentRetries(
  issues: import('./types').SupervisorIssue[],
  tasks: PipelineTask[],
  plan: ExecutionPlan,
  store: PipelineContextStore,
  config: MultiAgentConfig,
  workspaceRoot: string,
  rotator: ModelRotator,
  callbacks?: MultiAgentPipelineCallbacks
): Promise<SubAgentResult[]> {
  const taskIds = new Set<string>();
  for (const issue of issues) {
    if (issue.taskId) taskIds.add(issue.taskId);
    if (issue.module) {
      for (const t of tasks) {
        if (t.module.toLowerCase() === issue.module!.toLowerCase()) {
          taskIds.add(t.id);
        }
      }
    }
  }
  if (taskIds.size === 0 && tasks.length > 0) {
    taskIds.add(tasks[0]!.id);
  }

  const targeted = tasks.filter((t) => taskIds.has(t.id));
  return runSubAgents(targeted, plan, store, config, workspaceRoot, rotator, callbacks);
}

function emitStage(
  callbacks: MultiAgentPipelineCallbacks | undefined,
  stage: MultiAgentStageId,
  status: 'active' | 'done',
  detail?: string
): void {
  callbacks?.onMultiAgentStatus?.(stage, status, detail);
}

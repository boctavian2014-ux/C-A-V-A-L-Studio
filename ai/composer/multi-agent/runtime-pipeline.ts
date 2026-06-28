import fs from 'node:fs';

import path from 'node:path';



import type { WebContents } from 'electron';

import type { CavalChatStreamRequest } from '../../../src/main/model-handlers';

import {

  parseReasoningFromDecomposition,

  formatReasoningMarkdown,

} from '../reasoning-brief';

import { RUNTIME_PIPELINE_PROMPT } from '../../prompts/multi-agent';

import type { ModelSelectionId } from '../../models/model-catalog';

import { runDevToolsIntegration } from './devtools-integration';

import { loadMultiAgentConfig, applyMultiAgentOverrides } from './config';

import { FullIntegrationAgent } from './integration-agent';

import { formatOrchestratorSummary } from './orchestrator-plan';

import { ModelRotator, planExecution } from './orchestrator';

import { PipelineContextStore } from './pipeline-context-store';

import { PipelineMemoryEngine } from './pipeline-memory';

import {

  runContextCapture,

  runDecomposition,

  runFinalComposer,

  runMerge,

  runSubAgents,

  runSupervisor,

  runTargetedSubAgentRetries,

} from './stage-runners';

import { partitionTasksByUiPhase, hasUiSpecInPrompt } from '../ui-spec-detector';
import { applyPipelineScaffold } from '../scaffold-apply-node';
import { ensureMcpServersReady } from '../../tools/tool-runtime';

import { rememberCheckpoint, getCheckpoint, loadCheckpointFromDisk, clearCheckpoint } from './pipeline-checkpoint';

import type {

  MultiAgentPipelineCallbacks,

  MultiAgentPipelineResult,

  MultiAgentStageId,

  PipelineState,

  StageRecord,

} from './types';



const activeAborts = new Map<string, () => void>();



export function registerMultiAgentAbort(streamId: string, abort: () => void): void {

  activeAborts.set(streamId, abort);

}



export function clearMultiAgentAbort(streamId: string): void {

  activeAborts.delete(streamId);

}



export function abortMultiAgentPipeline(streamId: string): void {

  activeAborts.get(streamId)?.();

  activeAborts.delete(streamId);

}



function newRunId(): string {

  return `ma-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

}



function initStage(id: MultiAgentStageId): StageRecord {

  return { id, status: 'pending' };

}



function markStage(stages: StageRecord[], id: MultiAgentStageId, status: StageRecord['status'], detail?: string): void {

  const stage = stages.find((s) => s.id === id);

  if (!stage) return;

  stage.status = status;

  if (detail) stage.detail = detail;

  if (status === 'active') stage.startedAt = Date.now();

  if (status === 'done' || status === 'failed') stage.finishedAt = Date.now();

}



function persistArtifacts(

  state: PipelineState,

  config: ReturnType<typeof loadMultiAgentConfig>,

  integrationMd?: string

): void {

  if (!config.persistArtifacts || !state.workspaceRoot) return;

  try {

    const dir = path.join(state.workspaceRoot, '.cavalo', 'pipeline', state.runId);

    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(path.join(dir, 'context.json'), JSON.stringify(state.context, null, 2));

    if (state.decompositionRaw) {

      fs.writeFileSync(path.join(dir, 'decomposition.md'), state.decompositionRaw);

    }

    if (state.mergeRaw) {

      fs.writeFileSync(path.join(dir, 'merge.md'), state.mergeRaw);

    }

    if (state.supervisor) {

      fs.writeFileSync(path.join(dir, 'supervisor.md'), state.supervisor.raw);

    }

    if (integrationMd) {

      fs.writeFileSync(path.join(dir, 'integration.md'), integrationMd);

    }

    if (state.devTools) {

      fs.writeFileSync(path.join(dir, 'devtools.json'), JSON.stringify(state.devTools, null, 2));

    }

    if (state.reasoningBrief) {

      fs.writeFileSync(

        path.join(dir, 'reasoning.md'),

        formatReasoningMarkdown(state.reasoningBrief)

      );

    }

    const summary = buildRuntimeSummary(state);

    fs.writeFileSync(path.join(dir, 'summary.md'), summary);

  } catch {

    // non-fatal

  }

}



function buildRuntimeSummary(state: PipelineState): string {

  const lines = [

    RUNTIME_PIPELINE_PROMPT.split('\n')[0] ?? 'Cavallo Runtime Summary',

    '',

    '**Pipeline Execution Summary**',

    `Run: ${state.runId}`,

    `Tasks: ${state.tasks.length}`,

    `Sub-agents ok: ${state.subAgentResults.filter((r) => r.ok).length}/${state.subAgentResults.length}`,

    '',

    '**Stage-by-Stage Status**',

    ...state.stages.map((s) => `- ${s.id}: ${s.status}${s.detail ? ` (${s.detail})` : ''}`),

    '',

    '**Supervisor Status**',

    state.supervisor ? `${state.supervisor.approved ? 'APPROVED' : 'REJECTED'} — ${state.supervisor.summary}` : 'N/A',

    '',

    '**Final Composition Status**',

    state.composerText ? `${state.composerText.length} chars emitted` : 'none',

    '',

    '**DevTools Status**',

    state.integrationSummary?.devToolsStatus ?? 'N/A',

  ];

  return lines.join('\n');

}



function buildCompactChatSummary(state: PipelineState): string {

  const stages = 'Memory→Context→Decompose→Sub→Compose→Integrate';

  if (state.composerText.includes('```')) {

    const fenceCount = Math.floor((state.composerText.match(/```/g)?.length ?? 0) / 2);

    const gitHint = state.devTools?.git?.isRepo

      ? `\nGit: ${state.devTools.git.branch ?? 'repo'} (${state.devTools.git.changedFiles ?? 0} changed)`

      : '';

    return `✓ Full Integration complete (${stages}).\n${fenceCount} file block(s) — vezi editorul.${gitHint}`;

  }

  return `✓ Pipeline ${stages} finished.\n${state.supervisor?.summary ?? 'Review complete.'}\nVezi editorul pentru cod.`;

}



export function buildSyntheticMerge(store: PipelineContextStore): string {

  const tasks = store.getTasks();

  const parts = [

    '**Merged Architecture Overview**',

    'Fast pipeline — sub-agent outputs combined for final composition.',

    '',

    '**Merged Modules & Responsibilities**',

    ...tasks.map((t) => `- ${t.module}: ${t.description}`),

    '',

    '**Sub-Agent Outputs**',

  ];

  for (const t of tasks) {

    const out = store.getSubAgentOutput(t.id) ?? `(pending: ${t.description})`;

    parts.push(`### ${t.module} (${t.id})\n${out.slice(0, 6000)}`);

  }

  return parts.join('\n');

}



export async function runCavalloMultiAgentPipeline(

  sender: WebContents,

  streamId: string,

  request: CavalChatStreamRequest,

  callbacks: MultiAgentPipelineCallbacks

): Promise<MultiAgentPipelineResult> {

  const workspaceRoot = request.workspaceRoot ?? process.cwd();

  const config = applyMultiAgentOverrides(loadMultiAgentConfig(workspaceRoot), {
    strictReview: request.strictReview,
  });

  const model = request.model as ModelSelectionId;

  const runId = newRunId();

  let aborted = false;



  registerMultiAgentAbort(streamId, () => {

    aborted = true;

  });



  const isAborted = () => aborted;



  const integrationAgent = new FullIntegrationAgent();

  const memoryEngine = PipelineMemoryEngine.load(workspaceRoot);



  const stageIds: MultiAgentStageId[] = [

    'memory',

    'context',

    'orchestrator',

    'decompose',

    'subagent',

    'merge',

    'supervisor',

    'compose',

    'integrate',

  ];

  const stages: StageRecord[] = stageIds.map(initStage);



  const state: PipelineState = {

    runId,

    userMessage: request.message,

    workspaceRoot,

    model,

    context: {

      userIntent: '',

      normalizedRequirements: '',

      functionalRequirements: [],

      nonFunctionalRequirements: [],

      platformConstraints: [],

      storeCompliance: [],

      architectureContext: '',

      moduleContext: '',

      interfaceContext: '',

      dependencyMap: '',

      pendingIssues: [],

    },

    tasks: [],

    subAgentResults: [],

    stages,

    composerText: '',

    aborted: false,

  };



  let integrationPlan = integrationAgent.planIntegration(runId, 0);



  const pipelineCallbacks: MultiAgentPipelineCallbacks = {

    ...callbacks,

    onMultiAgentStatus: (stage, status, detail) => {

      markStage(stages, stage, status === 'active' ? 'active' : 'done', detail);

      callbacks.onMultiAgentStatus?.(stage, status, detail);

    },

  };



  try {

    if (workspaceRoot?.trim()) {
      await ensureMcpServersReady(workspaceRoot).catch(() => undefined);
    }

    callbacks.onStatus?.('prepare', 'done');

    callbacks.onStatus?.('route', 'active');



    pipelineCallbacks.onMultiAgentStatus?.('memory', 'active', 'load persistent memory');

    pipelineCallbacks.onMultiAgentStatus?.('memory', 'done', `${memoryEngine.getRecentRuns().length} past runs`);



    pipelineCallbacks.onMultiAgentStatus?.('integrate', 'active', 'Full Integration init');

    integrationPlan = integrationAgent.planIntegration(runId, config.maxTasks);

    pipelineCallbacks.onMultiAgentStatus?.('integrate', 'done', 'graph ready');



    pipelineCallbacks.onMultiAgentStatus?.('context', 'active', 'pipeline start');



    if (isAborted()) {

      return { ok: false, error: 'Aborted', runId };

    }



    const projectContext = request.context?.projectContext;

    const store = await runContextCapture(

      model,

      request.message,

      projectContext,

      workspaceRoot,

      pipelineCallbacks,

      config.skipContextLlm

    );



    const enriched = integrationAgent.applyMemoryToContext(memoryEngine, store.getContext());

    store.setContext(enriched);

    state.context = enriched;

    memoryEngine.syncFromContext(enriched);



    markStage(stages, 'orchestrator', 'active');

    pipelineCallbacks.onMultiAgentStatus?.('orchestrator', 'active');



    const rotator = new ModelRotator();

    await rotator.init();



    const decomp = await runDecomposition(model, store, config, workspaceRoot, pipelineCallbacks);

    if ('error' in decomp) {

      return { ok: false, error: decomp.error, runId };

    }

    state.tasks = decomp.tasks;

    state.decompositionRaw = decomp.raw;

    memoryEngine.syncFromDecomposition(decomp.tasks, decomp.raw);



    if (config.reasoningLayer.enabled) {

      const brief = parseReasoningFromDecomposition(decomp.raw, request.message, decomp.tasks);

      state.reasoningBrief = brief;

      if (config.reasoningLayer.showEarlyBrief) {

        pipelineCallbacks.onReasoningBrief?.(brief);

      }

    }



    integrationPlan = integrationAgent.planIntegration(runId, decomp.tasks.length);



    const plan = planExecution(runId, decomp.tasks, rotator);

    state.plan = plan;

    markStage(stages, 'orchestrator', 'done', `${decomp.tasks.length} tasks mapped`);

    pipelineCallbacks.onMultiAgentStatus?.('orchestrator', 'done', formatOrchestratorSummary(plan, decomp.tasks).slice(0, 120));



    callbacks.onStatus?.('route', 'done', model);

    callbacks.onStatus?.('connect', 'done');



    state.subAgentResults = [];

    const { preUi, ui } = partitionTasksByUiPhase(decomp.tasks);

    if (preUi.length > 0) {
      const preResults = await runSubAgents(
        preUi,
        plan,
        store,
        config,
        workspaceRoot,
        rotator,
        pipelineCallbacks,
        isAborted
      );
      state.subAgentResults.push(...preResults);
    }

    if (isAborted()) {
      state.aborted = true;
      return { ok: false, error: 'Aborted', runId };
    }

    const needsUiGate =
      config.fullDelivery.enabled &&
      config.fullDelivery.uiCheckpoint &&
      ui.length > 0 &&
      !hasUiSpecInPrompt(request.message);

    if (needsUiGate) {
      const snapshot = store.exportSnapshot();
      rememberCheckpoint({
        runId,
        streamId,
        workspaceRoot,
        model,
        strictReview: request.strictReview,
        userMessage: request.message,
        decompositionRaw: state.decompositionRaw ?? decomp.raw,
        tasks: decomp.tasks,
        uiTasks: ui,
        preUiResults: [...state.subAgentResults],
        plan,
        context: snapshot.context,
        subAgentOutputs: snapshot.subAgentOutputs,
        reasoningBrief: state.reasoningBrief,
      });

      sender.send('caval:ai-stream-chunk', {
        streamId,
        type: 'delivery-pause',
        pauseReason: 'ui-design',
        runId,
      });

      clearMultiAgentAbort(streamId);
      return {
        ok: true,
        paused: true,
        pauseReason: 'ui-design',
        runId,
        text: 'Preferințe UI necesare — continuă delivery după răspuns.',
        reasoningBrief: state.reasoningBrief,
      };
    }

    if (ui.length > 0) {
      const uiResults = await runSubAgents(
        ui,
        plan,
        store,
        config,
        workspaceRoot,
        rotator,
        pipelineCallbacks,
        isAborted
      );
      state.subAgentResults.push(...uiResults);
    }



    if (isAborted()) {

      state.aborted = true;

      return { ok: false, error: 'Aborted', runId };

    }



    if (config.fastPipeline) {

      pipelineCallbacks.onMultiAgentStatus?.('merge', 'active', 'fast path');

      const synth = buildSyntheticMerge(store);

      store.setMergeRaw(synth);

      state.mergeRaw = synth;

      pipelineCallbacks.onMultiAgentStatus?.('merge', 'done', 'skipped');

      pipelineCallbacks.onMultiAgentStatus?.('supervisor', 'done', 'skipped');

      state.supervisor = {

        approved: true,

        raw: 'FAST_PIPELINE',

        issues: [],

        summary: 'fast path ok',

      };

    } else {

      let mergeResult = await runMerge(model, store, workspaceRoot, pipelineCallbacks);

      if ('error' in mergeResult) {

        return { ok: false, error: mergeResult.error, runId };

      }

      state.mergeRaw = mergeResult.raw;



      let supervisor = await runSupervisor(model, store, workspaceRoot, pipelineCallbacks);

      if ('error' in supervisor) {

        return { ok: false, error: supervisor.error, runId };

      }

      state.supervisor = supervisor;



      let retries = 0;

      while (!supervisor.approved && retries < config.supervisorRetries && !isAborted()) {

        retries += 1;

        state.subAgentResults.push(

          ...(await runTargetedSubAgentRetries(

            supervisor.issues,

            decomp.tasks,

            plan,

            store,

            config,

            workspaceRoot,

            rotator,

            pipelineCallbacks

          ))

        );

        mergeResult = await runMerge(model, store, workspaceRoot, pipelineCallbacks);

        if ('error' in mergeResult) break;

        state.mergeRaw = mergeResult.raw;



        const supRetry = await runSupervisor(model, store, workspaceRoot, pipelineCallbacks);

        if ('error' in supRetry) break;

        supervisor = supRetry;

        state.supervisor = supervisor;

      }

    }



    if (isAborted()) {

      state.aborted = true;

      return { ok: false, error: 'Aborted', runId };

    }



    let composeText = '';
    let composeModel = model;
    let composeProvider = '';
    let composeWaves = 0;
    const maxWaves = config.fullDelivery.enabled ? config.fullDelivery.maxComposeWaves : 1;

    while (composeWaves < maxWaves) {
      const compose = await runFinalComposer(
        model,
        store,
        workspaceRoot,
        pipelineCallbacks,
        isAborted,
        { waveIndex: composeWaves }
      );

      if (!compose.ok) {
        return { ok: false, error: compose.error, runId };
      }

      composeText = composeWaves === 0 ? compose.text : `${composeText}\n\n${compose.text}`;
      composeModel = compose.model;
      composeProvider = compose.provider;
      composeWaves += 1;

      const fenceCount = Math.floor((compose.text.match(/```/g)?.length ?? 0) / 2);
      if (fenceCount >= 2) break;
      if (!config.fullDelivery.enabled) break;
    }

    state.composerText = composeText;



    pipelineCallbacks.onMultiAgentStatus?.('integrate', 'active', 'Git/MCP/Terminal');

    if (config.enableDevToolsIntegration) {

      state.devTools = await runDevToolsIntegration(workspaceRoot);

    }

    pipelineCallbacks.onMultiAgentStatus?.('integrate', 'done', state.devTools?.git?.isRepo ? 'git synced' : 'done');



    memoryEngine.recordRun({

      runId,

      userMessage: request.message,

      tasks: decomp.tasks,

      supervisor: state.supervisor,

    });

    memoryEngine.save(workspaceRoot);



    state.integrationSummary = integrationAgent.buildIntegrationSummary(state, integrationPlan, state.devTools);

    const integrationMd = integrationAgent.formatSummaryMarkdown(state.integrationSummary);

    persistArtifacts(state, config, integrationMd);



    const chatSummary = buildCompactChatSummary(state);

    const stageSummary = buildRuntimeSummary(state);

    const writtenFiles = applyPipelineScaffold(workspaceRoot, composeText, store);



    return {

      ok: true,

      text: composeText.trim() ? composeText : chatSummary,

      composeText,

      writtenFiles,

      resolvedModel: composeModel,

      provider: composeProvider,

      runId,

      stageSummary,

      reasoningBrief: state.reasoningBrief,

      pipelineRecapMeta: config.reasoningLayer.enabled

        ? {

            taskCount: decomp.tasks.length,

            fastPipeline: config.fastPipeline,

            pendingIssues: state.context.pendingIssues,

            composeWaves,

            devTools: state.devTools,

            supervisor: state.supervisor,

          }

        : undefined,

    };

  } finally {

    clearMultiAgentAbort(streamId);

  }

}



export async function resumeCavalloMultiAgentPipeline(
  _sender: WebContents,
  streamId: string,
  input: {
    runId: string;
    uiPreferences: string;
    workspaceRoot: string;
    model: string;
    strictReview?: boolean;
  },
  callbacks: MultiAgentPipelineCallbacks
): Promise<MultiAgentPipelineResult> {
  const cp =
    getCheckpoint(input.runId) ?? loadCheckpointFromDisk(input.workspaceRoot, input.runId);
  if (!cp) {
    return { ok: false, error: 'Checkpoint not found', runId: input.runId };
  }

  const workspaceRoot = input.workspaceRoot;
  const config = applyMultiAgentOverrides(loadMultiAgentConfig(workspaceRoot), {
    strictReview: input.strictReview ?? cp.strictReview,
  });
  const model = (input.model || cp.model) as ModelSelectionId;
  const runId = cp.runId;

  let aborted = false;
  registerMultiAgentAbort(streamId, () => {
    aborted = true;
  });
  const isAborted = () => aborted;

  const store = PipelineContextStore.fromSnapshot({
    context: cp.context,
    tasks: cp.tasks,
    decompositionRaw: cp.decompositionRaw,
    subAgentOutputs: cp.subAgentOutputs,
  });
  store.applyUiPreferences(input.uiPreferences);

  const rotator = new ModelRotator();
  await rotator.init();

  const memoryEngine = PipelineMemoryEngine.load(workspaceRoot);

  const pipelineCallbacks: MultiAgentPipelineCallbacks = {
    ...callbacks,
    onMultiAgentStatus: (stage, status, detail) => {
      callbacks.onMultiAgentStatus?.(stage, status, detail);
    },
  };

  try {
    if (cp.uiTasks.length > 0) {
      await runSubAgents(
        cp.uiTasks,
        cp.plan,
        store,
        config,
        workspaceRoot,
        rotator,
        pipelineCallbacks,
        isAborted
      );
    }

    if (isAborted()) {
      return { ok: false, error: 'Aborted', runId };
    }

    let supervisor;
    if (config.fastPipeline) {
      const synth = buildSyntheticMerge(store);
      store.setMergeRaw(synth);
      supervisor = {
        approved: true,
        raw: 'FAST_PIPELINE',
        issues: [],
        summary: 'fast path ok',
      };
    } else {
      const mergeResult = await runMerge(model, store, workspaceRoot, pipelineCallbacks);
      if ('error' in mergeResult) {
        return { ok: false, error: mergeResult.error, runId };
      }
      const sup = await runSupervisor(model, store, workspaceRoot, pipelineCallbacks);
      if ('error' in sup) {
        return { ok: false, error: sup.error, runId };
      }
      supervisor = sup;
    }

    let composeText = '';
    let composeModel = model;
    let composeProvider = '';
    let composeWaves = 0;
    const maxWaves = config.fullDelivery.enabled ? config.fullDelivery.maxComposeWaves : 1;

    while (composeWaves < maxWaves) {
      const compose = await runFinalComposer(
        model,
        store,
        workspaceRoot,
        pipelineCallbacks,
        isAborted,
        { waveIndex: composeWaves }
      );
      if (!compose.ok) {
        return { ok: false, error: compose.error, runId };
      }
      composeText = composeWaves === 0 ? compose.text : `${composeText}\n\n${compose.text}`;
      composeModel = compose.model;
      composeProvider = compose.provider;
      composeWaves += 1;
      const fenceCount = Math.floor((compose.text.match(/```/g)?.length ?? 0) / 2);
      if (fenceCount >= 2) break;
      if (!config.fullDelivery.enabled) break;
    }

    if (config.enableDevToolsIntegration) {
      await runDevToolsIntegration(workspaceRoot);
    }

    memoryEngine.recordRun({
      runId,
      userMessage: cp.userMessage,
      tasks: cp.tasks,
      supervisor,
    });
    memoryEngine.save(workspaceRoot);
    clearCheckpoint(runId);

    const writtenFiles = applyPipelineScaffold(workspaceRoot, composeText, store);

    return {
      ok: true,
      text: composeText,
      composeText,
      writtenFiles,
      resolvedModel: composeModel,
      provider: composeProvider,
      runId,
      reasoningBrief: cp.reasoningBrief,
      pipelineRecapMeta: {
        taskCount: cp.tasks.length,
        fastPipeline: config.fastPipeline,
        pendingIssues: store.getContext().pendingIssues,
        composeWaves,
        supervisor,
      },
    };
  } finally {
    clearMultiAgentAbort(streamId);
  }
}



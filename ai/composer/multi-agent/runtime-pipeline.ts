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

import { ModelRotator, planExecutionWithRoles } from './orchestrator';
import { applyRoleModelsToPlan } from './arena-model-orchestrator';
import { runArenaConsistencyOnly, runArenaPostCompose } from './arena-post-compose';
import { buildArenaContinueMessage, buildGateRepairMessage } from '../../prompts/arena-continue';

import { evaluateCompletionGate } from '../project-completion-gate';
import { resolveDeliveryOutcome } from './delivery-status';
import {
  pendingFastPipelineSupervisor,
  runProgrammaticSupervisor,
} from './programmatic-supervisor';
import { detectFashionArchetype } from '../../scaffolds/fashion-matching/archetype';
import { remediateWorkspaceBeforeGate } from '../../scaffolds/workspace-cleanup';

import { PipelineContextStore, CAVALLO_AUTO_UI_PREFERENCES } from './pipeline-context-store';
import { partitionTasksByUiPhase, hasUiSpecInPrompt } from '../ui-spec-detector';
import { applyPipelineScaffold } from '../scaffold-apply-node';
import { ensureMcpServersReady } from '../../tools/tool-runtime';

import { rememberCheckpoint, getCheckpoint, loadCheckpointFromDisk, clearCheckpoint } from './pipeline-checkpoint';

import { PipelineMemoryEngine } from './pipeline-memory';

import {
  runContextCapture,
  runDecomposition,
  runFinalComposer,
  runMerge,
  runModelOrchestrator,
  runSubAgents,
  runSupervisor,
  runTargetedSubAgentRetries,
  stageModelForRole,
} from './stage-runners';

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

    RUNTIME_PIPELINE_PROMPT.split('\n')[0] ?? 'CAVALLO Runtime Summary',

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



function buildCompactChatSummary(
  state: PipelineState,
  gateOk: boolean,
  writtenFiles: string[] = []
): string {
  const stages = 'Review→Test→Verify→Integrate';

  if (!gateOk) {
    const hint = state.supervisor?.summary?.slice(0, 200) ?? 'Remediere automată în curs.';
    return `Delivery incomplet (${stages}).\n${hint}`;
  }

  const runHints: string[] = [];
  if (writtenFiles.some((f) => /readme/i.test(f))) runHints.push('README');
  if (writtenFiles.some((f) => /package\.json$/i.test(f))) runHints.push('npm install && npm start / npm test');

  const gitHint = state.devTools?.git?.isRepo
    ? `\nGit: ${state.devTools.git.branch ?? 'repo'} (${state.devTools.git.changedFiles ?? 0} changed)`
    : '';

  if (state.composerText.includes('```')) {
    const fenceCount = Math.floor((state.composerText.match(/```/g)?.length ?? 0) / 2);
    const runLine = runHints.length ? `\nRun: ${runHints.join(' · ')}` : '';
    return `✓ Produs ready-to-use (${stages}).\n${fenceCount} file block(s) — vezi editorul.${runLine}${gitHint}`;
  }

  return `✓ Produs ready-to-use (${stages}).\n${state.supervisor?.summary ?? 'Review APPROVED.'}${gitHint}`;
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
    message: request.message,
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

    'modelOrch',

    'orchestrator',

    'decompose',

    'subagent',

    'merge',

    'supervisor',

    'compose',

    'userSim',

    'security',

    'performance',

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

    onMultiAgentStatus: (stage, status, detail, modelId, stepId) => {

      markStage(stages, stage, status === 'active' ? 'active' : 'done', detail);

      callbacks.onMultiAgentStatus?.(stage, status, detail, modelId, stepId);

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



    const rotator = new ModelRotator();
    await rotator.init();
    const { plan: arenaModels } = await runModelOrchestrator(
      model,
      request.message,
      '',
      rotator,
      workspaceRoot,
      pipelineCallbacks
    );
    markStage(stages, 'modelOrch', 'done', arenaModels.summary.slice(0, 80));
    state.roleModelMap = arenaModels.roleModelMap;

    const mergeModel = stageModelForRole('merge', arenaModels, model);
    const supervisorModel = stageModelForRole('supervisor', arenaModels, model);
    const composeModelId = stageModelForRole('compose', arenaModels, model);

    markStage(stages, 'orchestrator', 'active');

    pipelineCallbacks.onMultiAgentStatus?.('orchestrator', 'active');

    const decomposeModel = stageModelForRole('decompose', arenaModels, model);
    const decomp = await runDecomposition(
      decomposeModel,
      store,
      config,
      workspaceRoot,
      pipelineCallbacks
    );

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



    const basePlan = planExecutionWithRoles(runId, decomp.tasks, rotator, model);
    const plan = applyRoleModelsToPlan(
      basePlan,
      decomp.tasks,
      arenaModels.roleModelMap,
      rotator
    );

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

    if (ui.length > 0 && !hasUiSpecInPrompt(request.message)) {
      store.applyUiPreferences(CAVALLO_AUTO_UI_PREFERENCES, 'auto');
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

      state.supervisor = pendingFastPipelineSupervisor();

    } else {

      const mergeModel = stageModelForRole('merge', arenaModels, model);
      const supervisorModel = stageModelForRole('supervisor', arenaModels, model);

      let mergeResult = await runMerge(mergeModel, store, workspaceRoot, pipelineCallbacks);

      if ('error' in mergeResult) {

        return { ok: false, error: mergeResult.error, runId };

      }

      state.mergeRaw = mergeResult.raw;



      let supervisor = await runSupervisor(supervisorModel, store, workspaceRoot, pipelineCallbacks);

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

        mergeResult = await runMerge(mergeModel, store, workspaceRoot, pipelineCallbacks);

        if ('error' in mergeResult) break;

        state.mergeRaw = mergeResult.raw;



        const supRetry = await runSupervisor(supervisorModel, store, workspaceRoot, pipelineCallbacks);

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
        composeModelId,
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
      const taskCount = store.getTasks().length;
      const minFences = Math.max(
        config.fullDelivery.minFencesAbsolute,
        taskCount * config.fullDelivery.minFencesPerTask
      );
      if (fenceCount >= minFences) break;
      if (!config.fullDelivery.enabled) break;
    }

    state.composerText = composeText;



    pipelineCallbacks.onMultiAgentStatus?.('integrate', 'active', 'Git/verify');

    const writtenFiles = applyPipelineScaffold(workspaceRoot, composeText, store);

    let finalWrittenFiles = writtenFiles;
    let arenaPost = await runArenaPostCompose({
      workspaceRoot,
      writtenFiles,
      tasks: decomp.tasks,
      plan,
      store,
      config,
      model,
      rotator,
      callbacks: pipelineCallbacks,
      isAborted,
    });
    finalWrittenFiles = arenaPost.writtenFiles;

    const maxArenaRepairWaves = config.fullDelivery.maxArenaRepairWaves;
    let arenaRepairWave = 0;
    while (
      !arenaPost.consistencyOk &&
      arenaPost.consistencyScan &&
      arenaRepairWave < maxArenaRepairWaves &&
      !isAborted()
    ) {
      arenaRepairWave += 1;
      pipelineCallbacks.onMultiAgentStatus?.(
        'compose',
        'active',
        `arena repair ${arenaRepairWave}/${maxArenaRepairWaves}`
      );
      const repair = await runFinalComposer(
        composeModelId,
        store,
        workspaceRoot,
        pipelineCallbacks,
        isAborted,
        {
          waveIndex: composeWaves + arenaRepairWave,
          repairMessage: buildArenaContinueMessage(arenaPost.consistencyScan),
        }
      );
      if (!repair.ok) break;
      composeText = `${composeText}\n\n${repair.text}`;
      const repaired = applyPipelineScaffold(workspaceRoot, repair.text, store);
      finalWrittenFiles = [...new Set([...finalWrittenFiles, ...repaired])];
      const scan = await runArenaConsistencyOnly(workspaceRoot, finalWrittenFiles);
      arenaPost = {
        ...arenaPost,
        writtenFiles: finalWrittenFiles,
        consistencyOk: scan.ok,
        consistencyScan: scan,
        summaries: { ...arenaPost.summaries, consistency: scan.summary },
      };
      pipelineCallbacks.onMultiAgentStatus?.('compose', 'done', scan.summary.slice(0, 80));
    }

    const remediation = remediateWorkspaceBeforeGate(workspaceRoot, request.message);
    if (remediation.deleted.length > 0 || remediation.created.length > 0) {
      const deletedSet = new Set(remediation.deleted.map((p) => p.replace(/\\/g, '/')));
      finalWrittenFiles = [
        ...new Set([
          ...finalWrittenFiles.filter((f) => !deletedSet.has(f.replace(/\\/g, '/'))),
          ...remediation.created,
        ]),
      ];
      const detail = [
        remediation.deleted.length ? `removed ${remediation.deleted.length}` : '',
        remediation.created.length ? `seeded ${remediation.created.join(', ')}` : '',
        remediation.fixed.length ? `fixed imports ${remediation.fixed.length}` : '',
      ]
        .filter(Boolean)
        .join('; ');
      if (detail) {
        pipelineCallbacks.onMultiAgentStatus?.('integrate', 'active', `workspace cleanup: ${detail}`);
      }
    }

    if (config.enableDevToolsIntegration && !config.devtoolsAsyncVerify) {
      state.devTools = await runDevToolsIntegration(workspaceRoot, {
        verify: finalWrittenFiles.length > 0,
        autoInstall: config.fullDelivery.autoInstallDependencies,
        writtenFiles: finalWrittenFiles,
      });
    } else if (config.enableDevToolsIntegration && config.devtoolsAsyncVerify) {
      state.devTools = await runDevToolsIntegration(workspaceRoot, {
        verify: false,
        autoInstall: false,
        writtenFiles: finalWrittenFiles,
      });
    }

    const maxGateRepairWaves = config.devtoolsAsyncVerify
      ? 0
      : config.fullDelivery.maxGateRepairWaves;
    let gateRepairWave = 0;
    while (
      state.devTools?.verify?.ran &&
      !state.devTools.verify.commands.every((c) => c.ok) &&
      gateRepairWave < maxGateRepairWaves &&
      !isAborted()
    ) {
      gateRepairWave += 1;
      const gateRemediation = remediateWorkspaceBeforeGate(workspaceRoot, request.message);
      if (
        gateRemediation.deleted.length > 0 ||
        gateRemediation.created.length > 0 ||
        gateRemediation.fixed.length > 0
      ) {
        const deletedSet = new Set(gateRemediation.deleted.map((p) => p.replace(/\\/g, '/')));
        finalWrittenFiles = [
          ...new Set([
            ...finalWrittenFiles.filter((f) => !deletedSet.has(f.replace(/\\/g, '/'))),
            ...gateRemediation.created,
          ]),
        ];
      }

      const failedVerify = state.devTools.verify.commands.find((c) => !c.ok);
      pipelineCallbacks.onMultiAgentStatus?.(
        'compose',
        'active',
        `gate repair ${gateRepairWave}/${maxGateRepairWaves}`
      );
      const gateRepair = await runFinalComposer(
        composeModelId,
        store,
        workspaceRoot,
        pipelineCallbacks,
        isAborted,
        {
          waveIndex: composeWaves + maxArenaRepairWaves + gateRepairWave,
          repairMessage: buildGateRepairMessage(failedVerify?.output ?? '', gateRepairWave),
        }
      );
      if (!gateRepair.ok) break;
      composeText = `${composeText}\n\n${gateRepair.text}`;
      const gateRepaired = applyPipelineScaffold(workspaceRoot, gateRepair.text, store);
      finalWrittenFiles = [...new Set([...finalWrittenFiles, ...gateRepaired])];

      if (config.enableDevToolsIntegration) {
        state.devTools = await runDevToolsIntegration(workspaceRoot, {
          verify: finalWrittenFiles.length > 0,
          autoInstall: config.fullDelivery.autoInstallDependencies,
          writtenFiles: finalWrittenFiles,
        });
      }
      pipelineCallbacks.onMultiAgentStatus?.(
        'integrate',
        'active',
        state.devTools?.verify?.summary?.slice(0, 80) ?? 'gate repair verify'
      );
    }

    const llmSupervisor = state.supervisor;
    const gateResult = evaluateCompletionGate({
      workspaceRoot,
      writtenFiles: finalWrittenFiles,
      userMessage: request.message,
      recap: llmSupervisor?.summary,
      taskCount: decomp.tasks.length,
      verify: state.devTools?.verify,
      consistencyOk: arenaPost.consistencyOk,
      arenaIssues: arenaPost.issues,
      supervisorApproved: llmSupervisor?.approved,
      supervisorRaw: llmSupervisor?.raw,
      supervisorFallback: config.supervisorFallback,
      fastPipeline: config.fastPipeline,
      devtoolsAsyncVerify: config.devtoolsAsyncVerify,
    });

    state.supervisor = runProgrammaticSupervisor(gateResult);

    if (!gateResult.ok) {
      memoryEngine.recordFailure({
        runId,
        userMessage: request.message,
        issues: gateResult.issues,
        archetype: gateResult.archetype,
      });
      const archetype = detectFashionArchetype(request.message);
      if (archetype) memoryEngine.setProjectArchetype(archetype);
    } else if (gateResult.archetype) {
      memoryEngine.setProjectArchetype(gateResult.archetype);
    }

    pipelineCallbacks.onMultiAgentStatus?.(
      'supervisor',
      'done',
      state.supervisor.summary.slice(0, 80)
    );

    memoryEngine.recordArenaFinish({
      files: finalWrittenFiles,
      roleCounts: decomp.tasks.reduce(
        (acc, t) => {
          const r = t.role ?? 'implementer';
          acc[r] = (acc[r] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      summaries: {
        userSim: arenaPost.summaries.userSim,
        security: arenaPost.summaries.security,
        performance: arenaPost.summaries.performance,
        scan: arenaPost.summaries.consistency ?? '',
      },
    });

    pipelineCallbacks.onMultiAgentStatus?.(
      'integrate',
      'done',
      state.devTools?.verify?.ran
        ? state.devTools.verify.summary
        : state.devTools?.git?.isRepo
          ? 'git synced'
          : 'done'
    );



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



    const chatSummary = buildCompactChatSummary(state, gateResult.ok, finalWrittenFiles);

    const stageSummary = buildRuntimeSummary(state);

    const delivery = resolveDeliveryOutcome({
      gate: gateResult,
      composeText,
      chatSummary,
      supervisorSummary: llmSupervisor?.summary,
      supervisorFallback: config.supervisorFallback,
      writtenFiles: finalWrittenFiles,
    });

    if (
      config.devtoolsAsyncVerify &&
      config.enableDevToolsIntegration &&
      finalWrittenFiles.length > 0
    ) {
      const { scheduleBackgroundVerify } = await import('../../../src/main/pipeline-verify-worker.js');
      scheduleBackgroundVerify(sender, {
        workspaceRoot,
        runId,
        streamId,
        senderId: sender.id,
        autoInstall: config.fullDelivery.autoInstallDependencies,
        writtenFiles: finalWrittenFiles,
        userMessage: request.message,
        taskCount: decomp.tasks.length,
        supervisorApproved: llmSupervisor?.approved,
        supervisorRaw: llmSupervisor?.raw,
        supervisorFallback: config.supervisorFallback,
        fastPipeline: config.fastPipeline,
        consistencyOk: arenaPost.consistencyOk,
      });
    }

    return {

      ok: true,

      text: delivery.text,

      composeText,

      writtenFiles: finalWrittenFiles,

      resolvedModel: composeModel,

      provider: composeProvider,

      runId,

      stageSummary,

      reasoningBrief: state.reasoningBrief,

      completionGate: gateResult,

      deliveryBlocked: delivery.deliveryBlocked,

      needsReview: delivery.needsReview,

      verifyPending: delivery.verifyPending,

      pipelineRecapMeta: config.reasoningLayer.enabled

        ? {

            taskCount: decomp.tasks.length,

            fastPipeline: config.fastPipeline,

            pendingIssues: [
              ...state.context.pendingIssues,
              ...gateResult.issues.map((i) => i.message),
            ],

            composeWaves,

            devTools: state.devTools,

            supervisor: state.supervisor,

            completionGate: gateResult,

            deliveryBlocked: delivery.deliveryBlocked,

            needsReview: delivery.needsReview,

            verifyPending: delivery.verifyPending,

            fullDelivery: { ...config.fullDelivery },

            roleModelMap: state.roleModelMap,

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
    message: cp.userMessage,
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

  const resumeArenaPlan = {
    primaryModel: model,
    roleModelMap: cp.plan.roleModelMap ?? {},
    summary: 'resume',
  };
  const resumeMergeModel = stageModelForRole('merge', resumeArenaPlan, model);
  const resumeSupervisorModel = stageModelForRole('supervisor', resumeArenaPlan, model);
  const resumeComposeModel = stageModelForRole('compose', resumeArenaPlan, model);

  const pipelineCallbacks: MultiAgentPipelineCallbacks = {
    ...callbacks,
    onMultiAgentStatus: (stage, status, detail, modelId, stepId) => {
      callbacks.onMultiAgentStatus?.(stage, status, detail, modelId, stepId);
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
      supervisor = pendingFastPipelineSupervisor();
    } else {
      const mergeResult = await runMerge(resumeMergeModel, store, workspaceRoot, pipelineCallbacks);
      if ('error' in mergeResult) {
        return { ok: false, error: mergeResult.error, runId };
      }
      const sup = await runSupervisor(resumeSupervisorModel, store, workspaceRoot, pipelineCallbacks);
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
        resumeComposeModel,
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

    const writtenFiles = applyPipelineScaffold(workspaceRoot, composeText, store);

    const devTools = config.enableDevToolsIntegration && !config.devtoolsAsyncVerify
      ? await runDevToolsIntegration(workspaceRoot, {
          verify: writtenFiles.length > 0,
          autoInstall: config.fullDelivery.autoInstallDependencies,
          writtenFiles,
        })
      : undefined;

    const gateResult = evaluateCompletionGate({
      workspaceRoot,
      writtenFiles,
      userMessage: cp.userMessage,
      recap: supervisor.summary,
      taskCount: cp.tasks.length,
      verify: devTools?.verify,
      supervisorApproved: supervisor.approved,
      supervisorRaw: supervisor.raw,
      supervisorFallback: config.supervisorFallback,
      fastPipeline: config.fastPipeline,
      devtoolsAsyncVerify: config.devtoolsAsyncVerify,
    });
    supervisor = runProgrammaticSupervisor(gateResult);
    if (!gateResult.ok) {
      memoryEngine.recordFailure({
        runId,
        userMessage: cp.userMessage,
        issues: gateResult.blockingIssues.length > 0 ? gateResult.blockingIssues : gateResult.issues,
        archetype: gateResult.archetype,
      });
    }

    memoryEngine.recordRun({
      runId,
      userMessage: cp.userMessage,
      tasks: cp.tasks,
      supervisor,
    });
    memoryEngine.save(workspaceRoot);
    clearCheckpoint(runId);

    const delivery = resolveDeliveryOutcome({
      gate: gateResult,
      composeText,
      chatSummary: composeText,
      supervisorSummary: supervisor.summary,
      supervisorFallback: config.supervisorFallback,
      writtenFiles,
    });

    if (
      config.devtoolsAsyncVerify &&
      config.enableDevToolsIntegration &&
      writtenFiles.length > 0
    ) {
      const { scheduleBackgroundVerify } = await import('../../../src/main/pipeline-verify-worker.js');
      scheduleBackgroundVerify(_sender, {
        workspaceRoot,
        runId,
        streamId,
        senderId: _sender.id,
        autoInstall: config.fullDelivery.autoInstallDependencies,
        writtenFiles,
        userMessage: cp.userMessage,
        taskCount: cp.tasks.length,
        supervisorApproved: supervisor.approved,
        supervisorRaw: supervisor.raw,
        supervisorFallback: config.supervisorFallback,
        fastPipeline: config.fastPipeline,
      });
    }

    return {
      ok: true,
      text: delivery.text,
      composeText,
      writtenFiles,
      resolvedModel: composeModel,
      provider: composeProvider,
      runId,
      reasoningBrief: cp.reasoningBrief,
      completionGate: gateResult,
      deliveryBlocked: delivery.deliveryBlocked,
      needsReview: delivery.needsReview,
      verifyPending: delivery.verifyPending,
      pipelineRecapMeta: {
        taskCount: cp.tasks.length,
        fastPipeline: config.fastPipeline,
        pendingIssues: [
          ...store.getContext().pendingIssues,
          ...gateResult.issues.map((i) => i.message),
        ],
        composeWaves,
        supervisor,
        completionGate: gateResult,
        deliveryBlocked: delivery.deliveryBlocked,
        needsReview: delivery.needsReview,
        verifyPending: delivery.verifyPending,
        fullDelivery: { ...config.fullDelivery },
        roleModelMap: cp.plan.roleModelMap,
      },
    };
  } finally {
    clearMultiAgentAbort(streamId);
  }
}



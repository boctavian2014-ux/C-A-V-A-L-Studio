import type { PipelineMemoryEngine } from './pipeline-memory';
import type {
  DevToolsIntegrationResult,
  IntegrationSummary,
  MultiAgentStageId,
  PipelineState,
  PipelineTask,
  SubAgentResult,
} from './types';

export interface IntegrationPlan {
  runId: string;
  agentOrder: MultiAgentStageId[];
  contextSyncMap: Record<string, string>;
  subAgentCollaborationMap: Record<string, string>;
}

export class FullIntegrationAgent {
  planIntegration(runId: string, taskCount: number): IntegrationPlan {
    const agentOrder: MultiAgentStageId[] = [
      'memory',
      'integrate',
      'context',
      'orchestrator',
      'decompose',
      'subagent',
      'merge',
      'supervisor',
      'compose',
      'integrate',
    ];

    return {
      runId,
      agentOrder,
      contextSyncMap: {
        memory_to_context: 'PipelineMemoryEngine.enrichContext → Context Store',
        context_to_decompose: 'Normalized requirements → Decomposition Agent',
        decompose_to_subagent: 'Task[] → Sub-Agents (parallel)',
        subagent_to_merge: 'Sub-Agent outputs → Merge Agent',
        merge_to_supervisor: 'Merged project → Supervisor Agent',
        supervisor_to_compose: 'Validated plan + fixes → Final Composer',
        compose_to_devtools: 'Written files → Git/MCP/Terminal',
      },
      subAgentCollaborationMap: Object.fromEntries(
        Array.from({ length: taskCount }, (_, i) => [`task-${i + 1}`, 'model-rotated'])
      ),
    };
  }

  applyMemoryToContext(
    memory: PipelineMemoryEngine,
    context: import('./types').PipelineContext
  ): import('./types').PipelineContext {
    return memory.enrichContext(context);
  }

  buildIntegrationSummary(
    state: PipelineState,
    plan: IntegrationPlan,
    devTools?: DevToolsIntegrationResult
  ): IntegrationSummary {
    return {
      overview: `Run ${state.runId} — ${state.tasks.length} tasks, ${state.subAgentResults.filter((r) => r.ok).length} sub-agents ok`,
      agentOrder: plan.agentOrder.join(' → '),
      contextSyncMap: plan.contextSyncMap,
      subAgentMap: buildSubAgentMap(state.subAgentResults, state.tasks),
      mergeStatus: state.mergeRaw ? 'complete' : state.supervisor?.raw === 'FAST_PIPELINE' ? 'fast-path' : 'pending',
      supervisorStatus: state.supervisor
        ? state.supervisor.approved
          ? 'approved'
          : 'rejected'
        : 'skipped',
      composeStatus: state.composerText ? `${state.composerText.length} chars` : 'none',
      devToolsStatus: formatDevToolsStatus(devTools),
      runtimeStatus: state.aborted ? 'aborted' : state.composerText ? 'complete' : 'incomplete',
    };
  }

  formatSummaryMarkdown(summary: IntegrationSummary): string {
    return [
      '**Integration Overview**',
      summary.overview,
      '',
      '**Agent Execution Order**',
      summary.agentOrder,
      '',
      '**Context Synchronization Map**',
      ...Object.entries(summary.contextSyncMap).map(([k, v]) => `- ${k}: ${v}`),
      '',
      '**Sub-Agent Collaboration Map**',
      ...Object.entries(summary.subAgentMap).map(([k, v]) => `- ${k}: ${v}`),
      '',
      '**Merge Status**',
      summary.mergeStatus,
      '',
      '**Supervisor Status**',
      summary.supervisorStatus,
      '',
      '**Final Composition Status**',
      summary.composeStatus,
      '',
      '**Terminal/MCP/GitHub Integration Status**',
      summary.devToolsStatus,
      '',
      '**Runtime Pipeline Status**',
      summary.runtimeStatus,
    ].join('\n');
  }
}

function buildSubAgentMap(
  results: SubAgentResult[],
  tasks: PipelineTask[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const t of tasks) {
    const r = results.find((x) => x.taskId === t.id);
    map[t.id] = r ? `${r.modelId} (${r.ok ? 'ok' : 'fail'})` : 'pending';
  }
  return map;
}

function formatDevToolsStatus(devTools?: DevToolsIntegrationResult): string {
  if (!devTools) return 'not run';
  const parts: string[] = [];
  if (devTools.git) {
    parts.push(
      devTools.git.isRepo
        ? `git: ${devTools.git.branch ?? 'unknown'} (${devTools.git.changedFiles ?? 0} changed)`
        : 'git: not a repo'
    );
  }
  if (devTools.mcp) {
    parts.push(`mcp: ${devTools.mcp.serversReady} server(s) ready`);
  }
  if (devTools.terminal) {
    parts.push(
      devTools.terminal.buildScript
        ? 'terminal: build script'
        : devTools.terminal.testScript
          ? 'terminal: test script'
          : 'terminal: no npm scripts'
    );
  }
  if (devTools.verify?.ran) {
    parts.push(`verify: ${devTools.verify.summary}`);
  }
  if (devTools.github?.remoteUrl) {
    parts.push(`github: ${devTools.github.remoteUrl}`);
  }
  return parts.length ? parts.join('; ') : 'idle';
}

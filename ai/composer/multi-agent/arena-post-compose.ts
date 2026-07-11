import fs from 'node:fs';
import path from 'node:path';

import { runCavaloConsistencyScan, type ConsistencyScanResult } from '../consistency-engine';
import { applyPipelineScaffold } from '../scaffold-apply-node';
import { runWorkspaceVerify } from '../../tools/workspace-verify.js';
import type { ModelSelectionId } from '../../models/model-catalog';
import { runStaticPerformanceScan } from './arena-performance-scan';
import { runStaticSecurityScan } from './arena-security-scan';
import { runArenaUserSimulator } from './arena-user-simulator';
import {
  buildFixTasksFromIssues,
  buildPerfTasksFromPlan,
  partitionTasksByRole,
} from './task-partition';
import type { ModelRotator } from './orchestrator';
import { PipelineContextStore } from './pipeline-context-store';
import { runSubAgents } from './stage-runners';
import type {
  ArenaIssue,
  ArenaScanSummary,
  ExecutionPlan,
  MultiAgentConfig,
  MultiAgentPipelineCallbacks,
  PipelineTask,
} from './types';

export interface ArenaPostComposeResult {
  writtenFiles: string[];
  summaries: ArenaScanSummary;
  issues: ArenaIssue[];
  consistencyOk: boolean;
  consistencyScan?: ConsistencyScanResult;
}

export async function runArenaPostCompose(opts: {
  workspaceRoot: string;
  writtenFiles: string[];
  tasks: PipelineTask[];
  plan: ExecutionPlan;
  store: PipelineContextStore;
  config: MultiAgentConfig;
  model: ModelSelectionId;
  rotator: ModelRotator;
  callbacks: MultiAgentPipelineCallbacks;
  isAborted: () => boolean;
}): Promise<ArenaPostComposeResult> {
  const {
    workspaceRoot,
    writtenFiles: initialFiles,
    tasks,
    plan,
    store,
    config,
    rotator,
    callbacks,
    isAborted,
  } = opts;

  let writtenFiles = [...initialFiles];
  const allIssues: ArenaIssue[] = [];
  const summaries: ArenaScanSummary = {};

  const readFile = async (abs: string) => {
    try {
      return fs.readFileSync(abs, 'utf8');
    } catch {
      return null;
    }
  };

  const partitioned = partitionTasksByRole(tasks);

  if (partitioned.tester.length > 0 && !isAborted()) {
    callbacks.onMultiAgentStatus?.('subagent', 'active', `tester (${partitioned.tester.length})`);
    await runSubAgents(partitioned.tester, plan, store, config, workspaceRoot, rotator, callbacks, isAborted);
    callbacks.onMultiAgentStatus?.('subagent', 'done', 'tester');
  }

  callbacks.onMultiAgentStatus?.('userSim', 'active');
  const userSim = await runArenaUserSimulator(workspaceRoot, writtenFiles);
  summaries.userSim = userSim.summary;
  allIssues.push(...userSim.issues);
  callbacks.onMultiAgentStatus?.('userSim', 'done', userSim.summary.slice(0, 80));

  if (isAborted()) {
    return { writtenFiles, summaries, issues: allIssues, consistencyOk: false };
  }

  callbacks.onMultiAgentStatus?.('security', 'active');
  const security = runStaticSecurityScan(workspaceRoot, writtenFiles);
  summaries.security = security.summary;
  allIssues.push(...security.issues);
  callbacks.onMultiAgentStatus?.('security', 'done', security.summary.slice(0, 80));

  callbacks.onMultiAgentStatus?.('performance', 'active');
  const perf = runStaticPerformanceScan(workspaceRoot, writtenFiles);
  summaries.performance = perf.summary;
  allIssues.push(...perf.issues);
  callbacks.onMultiAgentStatus?.('performance', 'done', perf.summary.slice(0, 80));

  const fixTasks = [
    ...buildFixTasksFromIssues(
      allIssues.filter((i) => i.severity === 'critical' || i.severity === 'major'),
      'fix'
    ),
    ...buildPerfTasksFromPlan(perf.optimizationPlan, perf.issues),
    ...partitioned.implementerFix,
    ...partitioned.implementerPerf,
  ];

  if (fixTasks.length > 0 && !isAborted()) {
    callbacks.onMultiAgentStatus?.('subagent', 'active', `fix (${fixTasks.length})`);
    const fixResults = await runSubAgents(
      fixTasks,
      plan,
      store,
      config,
      workspaceRoot,
      rotator,
      callbacks,
      isAborted
    );
    const fixText = fixResults.map((r) => r.output).filter(Boolean).join('\n\n');
    if (fixText.trim()) {
      const extra = applyPipelineScaffold(workspaceRoot, fixText, store);
      writtenFiles = [...new Set([...writtenFiles, ...extra])];
    }
    callbacks.onMultiAgentStatus?.('subagent', 'done', 'fix');
  }

  if (partitioned.refactorer.length > 0 && !isAborted()) {
    callbacks.onMultiAgentStatus?.('subagent', 'active', `refactor (${partitioned.refactorer.length})`);
    const refResults = await runSubAgents(
      partitioned.refactorer,
      plan,
      store,
      config,
      workspaceRoot,
      rotator,
      callbacks,
      isAborted
    );
    const refText = refResults.map((r) => r.output).filter(Boolean).join('\n\n');
    if (refText.trim()) {
      const extra = applyPipelineScaffold(workspaceRoot, refText, store);
      writtenFiles = [...new Set([...writtenFiles, ...extra])];
    }
    callbacks.onMultiAgentStatus?.('subagent', 'done', 'refactor');
  }

  callbacks.onMultiAgentStatus?.('integrate', 'active', 'consistency scan');
  const scan = await runCavaloConsistencyScan({
    projectPath: workspaceRoot,
    writtenFiles,
    readFileContent: readFile,
    workspaceVerify: async (root) => {
      const v = await runWorkspaceVerify(root);
      return {
        ok: true,
        verify: {
          ran: v.ran,
          summary: v.summary,
          commands: v.commands.map((c: { command: string; ok: boolean; exitCode: number | null; output: string }) => ({
            command: c.command,
            ok: c.ok,
            exitCode: c.exitCode,
            output: c.output,
          })),
        },
      };
    },
  });
  summaries.consistency = scan.summary;
  callbacks.onMultiAgentStatus?.('integrate', 'done', scan.summary.slice(0, 80));

  return {
    writtenFiles,
    summaries,
    issues: allIssues,
    consistencyOk: scan.ok,
    consistencyScan: scan,
  };
}

export async function runArenaConsistencyOnly(
  workspaceRoot: string,
  writtenFiles: string[]
): Promise<ConsistencyScanResult> {
  const readFile = async (abs: string) => {
    try {
      return fs.readFileSync(abs, 'utf8');
    } catch {
      return null;
    }
  };
  return runCavaloConsistencyScan({
    projectPath: workspaceRoot,
    writtenFiles,
    readFileContent: readFile,
    workspaceVerify: async (root) => {
      const v = await runWorkspaceVerify(root);
      return {
        ok: true,
        verify: {
          ran: v.ran,
          summary: v.summary,
          commands: v.commands.map((c: { command: string; ok: boolean; exitCode: number | null; output: string }) => ({
            command: c.command,
            ok: c.ok,
            exitCode: c.exitCode,
            output: c.output,
          })),
        },
      };
    },
  });
}

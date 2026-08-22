import { runStaticPerformanceScan, type PerformanceScanResult } from './arena-performance-scan';
import { runStaticSecurityScan } from './arena-security-scan';
import { runArenaUserSimulator } from './arena-user-simulator';
import type { ArenaIssue, ArenaScanSummary, MultiAgentPipelineCallbacks } from './types';

/** Shared parallelGroup id for Arena post-compose scans (timeline peers stay active). */
export const ARENA_SCAN_PARALLEL_GROUP = 'arena-scans';

export interface ParallelArenaScanResult {
  summaries: Pick<ArenaScanSummary, 'userSim' | 'security' | 'performance'>;
  issues: ArenaIssue[];
  performance: PerformanceScanResult;
  /** Wall time for the parallel fan-out (ms). */
  elapsedMs: number;
}

/**
 * Run userSim + security + performance concurrently.
 * Static scans are sync; userSim may be async — Promise.all overlaps them.
 */
export async function runParallelArenaScans(opts: {
  workspaceRoot: string;
  writtenFiles: string[];
  callbacks?: MultiAgentPipelineCallbacks;
  scanModelId?: string;
  isAborted?: () => boolean;
  skipVerify?: boolean;
}): Promise<ParallelArenaScanResult> {
  const { workspaceRoot, writtenFiles, callbacks, scanModelId, isAborted, skipVerify } = opts;
  const started = Date.now();

  if (isAborted?.()) {
    return {
      summaries: {},
      issues: [],
      performance: { summary: '', issues: [], optimizationPlan: '' },
      elapsedMs: 0,
    };
  }

  const emit = (
    stage: 'userSim' | 'security' | 'performance',
    status: 'active' | 'done',
    detail?: string
  ) => {
    callbacks?.onMultiAgentStatus?.(
      stage,
      status,
      detail,
      scanModelId,
      stage,
      undefined,
      ARENA_SCAN_PARALLEL_GROUP
    );
  };

  emit('userSim', 'active', 'parallel');
  emit('security', 'active', 'parallel');
  emit('performance', 'active', 'parallel');

  const [userSim, security, performance] = await Promise.all([
    runArenaUserSimulator(workspaceRoot, writtenFiles, { skipVerify }),
    Promise.resolve().then(() => runStaticSecurityScan(workspaceRoot, writtenFiles)),
    Promise.resolve().then(() => runStaticPerformanceScan(workspaceRoot, writtenFiles)),
  ]);

  emit('userSim', 'done', userSim.summary.slice(0, 80));
  emit('security', 'done', security.summary.slice(0, 80));
  emit('performance', 'done', performance.summary.slice(0, 80));

  return {
    summaries: {
      userSim: userSim.summary,
      security: security.summary,
      performance: performance.summary,
    },
    issues: [...userSim.issues, ...security.issues, ...performance.issues],
    performance,
    elapsedMs: Date.now() - started,
  };
}

/** Pure helper for tests: which stages fan out together. */
export function arenaParallelScanStages(): Array<'userSim' | 'security' | 'performance'> {
  return ['userSim', 'security', 'performance'];
}

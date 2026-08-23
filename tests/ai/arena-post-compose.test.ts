import { beforeEach, describe, expect, it, vi } from 'vitest';

const runCavaloConsistencyScan = vi.fn();
const applyPipelineScaffold = vi.fn();
const runWorkspaceVerify = vi.fn();
const runParallelArenaScans = vi.fn();
const runSubAgents = vi.fn();
const partitionTasksByRole = vi.fn();
const buildFixTasksFromIssues = vi.fn();
const buildPerfTasksFromPlan = vi.fn();

vi.mock('../../ai/composer/consistency-engine', () => ({
  runCavaloConsistencyScan: (...args: unknown[]) => runCavaloConsistencyScan(...args),
}));

vi.mock('../../ai/composer/scaffold-apply-node', () => ({
  applyPipelineScaffold: (...args: unknown[]) => applyPipelineScaffold(...args),
}));

vi.mock('../../ai/tools/workspace-verify.js', () => ({
  runWorkspaceVerify: (...args: unknown[]) => runWorkspaceVerify(...args),
}));

vi.mock('../../ai/composer/multi-agent/arena-parallel-scans', () => ({
  runParallelArenaScans: (...args: unknown[]) => runParallelArenaScans(...args),
}));

vi.mock('../../ai/composer/multi-agent/stage-runners', () => ({
  runSubAgents: (...args: unknown[]) => runSubAgents(...args),
}));

vi.mock('../../ai/composer/multi-agent/task-partition', () => ({
  partitionTasksByRole: (...args: unknown[]) => partitionTasksByRole(...args),
  buildFixTasksFromIssues: (...args: unknown[]) => buildFixTasksFromIssues(...args),
  buildPerfTasksFromPlan: (...args: unknown[]) => buildPerfTasksFromPlan(...args),
}));

import { PipelineContextStore } from '../../ai/composer/multi-agent/pipeline-context-store';
import {
  runArenaConsistencyOnly,
  runArenaPostCompose,
} from '../../ai/composer/multi-agent/arena-post-compose';
import { DEFAULT_MULTI_AGENT_CONFIG } from '../../ai/composer/multi-agent/types';
import type { ModelRotator } from '../../ai/composer/multi-agent/orchestrator';

const emptyRoles = {
  implementer: [],
  tester: [],
  refactorer: [],
  implementerFix: [],
  implementerPerf: [],
};

describe('arena-post-compose', () => {
  const store = PipelineContextStore.createFallback('build app');
  const rotator = {} as ModelRotator;
  const callbacks = { onMultiAgentStatus: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    partitionTasksByRole.mockReturnValue(emptyRoles);
    buildFixTasksFromIssues.mockReturnValue([]);
    buildPerfTasksFromPlan.mockReturnValue([]);
    runParallelArenaScans.mockResolvedValue({
      summaries: {
        userSim: 'user ok',
        security: 'sec ok',
        performance: 'perf ok',
      },
      issues: [],
      performance: { optimizationPlan: '', issues: [] },
    });
    runWorkspaceVerify.mockResolvedValue({
      ran: true,
      summary: 'verify ok',
      commands: [{ command: 'npm test', ok: true, exitCode: 0, output: 'ok' }],
    });
    runCavaloConsistencyScan.mockImplementation(async (opts: {
      projectPath: string;
      writtenFiles: string[];
      readFileContent: (abs: string) => Promise<string | null>;
      workspaceVerify: (root: string) => Promise<{
        ok: boolean;
        verify: {
          ran: boolean;
          summary: string;
          commands: Array<{ command: string; ok: boolean; exitCode: number | null; output: string }>;
        };
      }>;
    }) => {
      await opts.readFileContent(`${opts.projectPath}/missing.ts`);
      const verify = await opts.workspaceVerify(opts.projectPath);
      return {
        ok: true,
        summary: `consistency ok ran=${verify.verify.ran} cmd=${verify.verify.commands[0]?.command}`,
      };
    });
    applyPipelineScaffold.mockReturnValue([]);
    runSubAgents.mockResolvedValue([]);
  });

  it('skips extra LLM work on the default fast pipeline and returns scan results', async () => {
    const result = await runArenaPostCompose({
      workspaceRoot: '/ws',
      writtenFiles: ['src/a.ts'],
      tasks: [],
      plan: { roleModelMap: { security: 'model-sec' } } as never,
      store,
      config: DEFAULT_MULTI_AGENT_CONFIG,
      model: 'auto' as never,
      rotator,
      callbacks,
      isAborted: () => false,
    });

    expect(runSubAgents).not.toHaveBeenCalled();
    expect(runParallelArenaScans).toHaveBeenCalledTimes(1);
    expect(runCavaloConsistencyScan).toHaveBeenCalledTimes(1);
    expect(runWorkspaceVerify).toHaveBeenCalledWith('/ws');
    expect(result.consistencyOk).toBe(true);
    expect(result.writtenFiles).toEqual(['src/a.ts']);
    expect(result.summaries.security).toBe('sec ok');
    expect(result.summaries.consistency).toBe('consistency ok ran=true cmd=npm test');
  });

  it('returns immediately with consistencyOk false when aborted before scans', async () => {
    const result = await runArenaPostCompose({
      workspaceRoot: '/ws',
      writtenFiles: ['src/a.ts'],
      tasks: [],
      plan: {} as never,
      store,
      config: DEFAULT_MULTI_AGENT_CONFIG,
      model: 'auto' as never,
      rotator,
      callbacks,
      isAborted: () => true,
    });

    expect(runParallelArenaScans).not.toHaveBeenCalled();
    expect(runCavaloConsistencyScan).not.toHaveBeenCalled();
    expect(result).toEqual({
      writtenFiles: ['src/a.ts'],
      summaries: {},
      issues: [],
      consistencyOk: false,
    });
  });

  it('does not run consistency when aborted after parallel scans', async () => {
    let calls = 0;
    const isAborted = () => {
      calls += 1;
      return calls > 1;
    };

    const result = await runArenaPostCompose({
      workspaceRoot: '/ws',
      writtenFiles: ['src/a.ts'],
      tasks: [],
      plan: {} as never,
      store,
      config: DEFAULT_MULTI_AGENT_CONFIG,
      model: 'auto' as never,
      rotator,
      callbacks,
      isAborted,
    });

    expect(runParallelArenaScans).toHaveBeenCalledTimes(1);
    expect(runCavaloConsistencyScan).not.toHaveBeenCalled();
    expect(result.consistencyOk).toBe(false);
    expect(result.summaries.security).toBe('sec ok');
  });

  it('runs tester sub-agents and applies fix scaffolds when fast pipeline is off', async () => {
    partitionTasksByRole.mockReturnValue({
      ...emptyRoles,
      tester: [
        {
          id: 't1',
          module: 'core',
          purpose: 'test',
          description: 'tester',
          dependencies: [],
        },
      ],
    });
    buildFixTasksFromIssues.mockReturnValue([
      {
        id: 'fix-1',
        module: 'fix',
        purpose: 'fix',
        description: 'fix',
        dependencies: [],
      },
    ]);
    runSubAgents
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ output: '```ts:src/fix.ts\nexport const fix = 1;\n```' }]);
    applyPipelineScaffold.mockReturnValue(['src/fix.ts']);
    runParallelArenaScans.mockResolvedValue({
      summaries: { userSim: '', security: '', performance: '' },
      issues: [{ severity: 'critical', source: 'sec', message: 'xss' }],
      performance: { optimizationPlan: '', issues: [] },
    });

    const result = await runArenaPostCompose({
      workspaceRoot: '/ws',
      writtenFiles: ['src/a.ts'],
      tasks: [],
      plan: {} as never,
      store,
      config: { ...DEFAULT_MULTI_AGENT_CONFIG, fastPipeline: false },
      model: 'auto' as never,
      rotator,
      callbacks,
      isAborted: () => false,
    });

    expect(runSubAgents).toHaveBeenCalledTimes(2);
    expect(applyPipelineScaffold).toHaveBeenCalled();
    expect(result.writtenFiles).toEqual(['src/a.ts', 'src/fix.ts']);
    expect(result.issues).toHaveLength(1);
  });

  it('does not apply a scaffold when extra-LLM testers return empty output', async () => {
    partitionTasksByRole.mockReturnValue({
      ...emptyRoles,
      tester: [
        {
          id: 't-empty',
          module: 'core',
          purpose: 'test',
          description: 'tester',
          dependencies: [],
        },
      ],
    });
    runSubAgents.mockResolvedValue([{ output: '   ' }]);

    const result = await runArenaPostCompose({
      workspaceRoot: '/ws',
      writtenFiles: ['src/a.ts'],
      tasks: [],
      plan: {} as never,
      store,
      config: { ...DEFAULT_MULTI_AGENT_CONFIG, fastPipeline: false },
      model: 'auto' as never,
      rotator,
      callbacks,
      isAborted: () => false,
    });

    expect(runSubAgents).toHaveBeenCalledTimes(1);
    expect(applyPipelineScaffold).not.toHaveBeenCalled();
    expect(result.writtenFiles).toEqual(['src/a.ts']);
  });

  it('runs refactorer sub-agents when fast pipeline is off', async () => {
    partitionTasksByRole.mockReturnValue({
      ...emptyRoles,
      refactorer: [
        {
          id: 'r1',
          module: 'core',
          purpose: 'refactor',
          description: 'cleanup',
          dependencies: [],
        },
      ],
    });
    runSubAgents.mockResolvedValue([
      { output: '```ts:src/clean.ts\nexport const clean = 1;\n```' },
    ]);
    applyPipelineScaffold.mockReturnValue(['src/clean.ts']);

    const result = await runArenaPostCompose({
      workspaceRoot: '/ws',
      writtenFiles: ['src/a.ts'],
      tasks: [],
      plan: {} as never,
      store,
      config: { ...DEFAULT_MULTI_AGENT_CONFIG, fastPipeline: false },
      model: 'auto' as never,
      rotator,
      callbacks,
      isAborted: () => false,
    });

    expect(runSubAgents).toHaveBeenCalledTimes(1);
    expect(applyPipelineScaffold).toHaveBeenCalledWith(
      '/ws',
      expect.stringContaining('src/clean.ts'),
      store
    );
    expect(result.writtenFiles).toEqual(['src/a.ts', 'src/clean.ts']);
  });

  it('runArenaConsistencyOnly returns the mocked consistency scan', async () => {
    const scan = await runArenaConsistencyOnly('/ws', ['src/a.ts']);
    expect(runCavaloConsistencyScan).toHaveBeenCalledTimes(1);
    expect(runWorkspaceVerify).toHaveBeenCalledWith('/ws');
    expect(scan.ok).toBe(true);
    expect(scan.summary).toBe('consistency ok ran=true cmd=npm test');
  });
});

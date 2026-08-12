import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildArenaModelPlan,
  complexityFromFastPipeline,
  getFastModelCandidates,
} from '../../ai/composer/multi-agent/arena-model-orchestrator';
import { ModelRotator } from '../../ai/composer/multi-agent/orchestrator';
import {
  ARENA_SCAN_PARALLEL_GROUP,
  arenaParallelScanStages,
  runParallelArenaScans,
} from '../../ai/composer/multi-agent/arena-parallel-scans';
import {
  classifyArenaPromptComplexity,
  applyComplexPromptOverrides,
} from '../../ai/composer/multi-agent/config';
import { DEFAULT_MULTI_AGENT_CONFIG } from '../../ai/composer/multi-agent/types';
import {
  formatLatencyMs,
  patchMultiAgentSteps,
} from '../../ai/composer/chat-activity-types';

describe('arena-model-orchestrator mix', () => {
  it('assigns fast scan models and primary implementer', async () => {
    const rotator = new ModelRotator();
    await rotator.init();
    const plan = buildArenaModelPlan('stepfun-step-3-7-flash', rotator, {
      complexity: 'simple',
    });
    expect(plan.complexity).toBe('simple');
    expect(plan.roleModelMap.implementer).toBe('stepfun-step-3-7-flash');
    expect(plan.roleModelMap.security).toBeTruthy();
    expect(plan.roleModelMap.userSim).toBeTruthy();
    expect(plan.roleModelMap.performance).toBeTruthy();
    expect(plan.summary).toContain('Mix(simple)');
  });

  it('uses power-leaning architect on complex prompts', async () => {
    const rotator = new ModelRotator();
    await rotator.init();
    const complex = buildArenaModelPlan('nex-n2-pro', rotator, { complexity: 'complex' });
    expect(complex.complexity).toBe('complex');
    expect(complex.roleModelMap.implementer).toBe('nex-n2-pro');
    expect(complex.roleModelMap.architect).toBeTruthy();
    expect(getFastModelCandidates().length).toBeGreaterThan(0);
  });

  it('maps fastPipeline flag to complexity', () => {
    expect(complexityFromFastPipeline(true)).toBe('simple');
    expect(complexityFromFastPipeline(false)).toBe('complex');
  });
});

describe('arena parallel scans', () => {
  it('lists the three parallel scan stages', () => {
    expect(arenaParallelScanStages()).toEqual(['userSim', 'security', 'performance']);
    expect(ARENA_SCAN_PARALLEL_GROUP).toBe('arena-scans');
  });

  it('emits parallelGroup on all three stages', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-arena-scan-'));
    try {
      fs.writeFileSync(
        path.join(workspaceRoot, 'package.json'),
        JSON.stringify({ name: 'arena-scan-fixture' })
      );
      const events: Array<{ stage: string; status: string; group?: string }> = [];
      const result = await runParallelArenaScans({
        workspaceRoot,
        writtenFiles: [],
        scanModelId: 'stepfun-step-3-7-flash',
        callbacks: {
          onMultiAgentStatus: (stage, status, _d, _m, _s, _a, parallelGroup) => {
            events.push({ stage, status, group: parallelGroup });
          },
        },
      });

      const active = events.filter((e) => e.status === 'active');
      expect(active.map((e) => e.stage).sort()).toEqual([
        'performance',
        'security',
        'userSim',
      ]);
      expect(active.every((e) => e.group === ARENA_SCAN_PARALLEL_GROUP)).toBe(true);
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(result.summaries.security).toBeTruthy();
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});

describe('complexity routing', () => {
  it('classifies short prompts as simple', () => {
    expect(classifyArenaPromptComplexity('fix typo')).toBe('simple');
  });

  it('classifies long multi-module prompts as complex and disables fastPipeline', () => {
    const msg = [
      'Build a full frontend dashboard with API module',
      'Add backend auth',
      'Add docker deploy',
      'Add scraper workers',
      'Wire monitoring',
      'Add tests',
      'Add docs',
      'Add CI',
    ].join('\n');
    expect(classifyArenaPromptComplexity(msg)).toBe('complex');
    const cfg = applyComplexPromptOverrides(
      { ...DEFAULT_MULTI_AGENT_CONFIG, fastPipeline: true },
      msg
    );
    expect(cfg.fastPipeline).toBe(false);
  });
});

describe('patchMultiAgentSteps parallel + latency', () => {
  it('keeps parallel peers active together', () => {
    let steps = patchMultiAgentSteps(
      undefined,
      'userSim',
      'active',
      'parallel',
      'flash',
      'userSim',
      undefined,
      'arena-scans'
    );
    steps = patchMultiAgentSteps(
      steps,
      'security',
      'active',
      'parallel',
      'flash',
      'security',
      undefined,
      'arena-scans'
    );
    const active = steps.filter((s) => s.status === 'active');
    expect(active).toHaveLength(2);
    expect(active.every((s) => s.parallelGroup === 'arena-scans')).toBe(true);
  });

  it('records latencyMs on done', () => {
    let steps = patchMultiAgentSteps(undefined, 'compose', 'active', undefined, 'm1');
    steps = patchMultiAgentSteps(steps, 'compose', 'done', undefined, 'm1');
    expect(typeof steps[0]!.latencyMs).toBe('number');
    expect(formatLatencyMs(250)).toBe('250ms');
    expect(formatLatencyMs(1500)).toBe('1.5s');
  });
});

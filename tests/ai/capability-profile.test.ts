import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  loadCapabilityMap,
  saveCapabilityMap,
  updateFromSubAgentResult,
  updateFromSupervisor,
  formatCapabilityMapForOrchestrator,
} from '../../ai/composer/multi-agent/capability-profile';

describe('capability-profile', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('updates EMA scores from sub-agent result', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cav-cap-'));
    const record = loadCapabilityMap(tmpDir);

    updateFromSubAgentResult(
      record,
      {
        taskId: '1.1',
        modelId: 'gemini-2.5-flash',
        ok: true,
        output: '```ts:src/app.ts\nexport const x = 1;\n```\n\n## Self-Audit\n- TaskSuccess: pass\n- ToolUseAccuracy: 90',
      },
      { useProgrammaticScores: true }
    );

    const profile = record.models['gemini-2.5-flash'];
    expect(profile).toBeDefined();
    expect(profile!.runs).toBe(1);
    expect(profile!.coding).toBeGreaterThan(50);
    expect(profile!.toolUse).toBeGreaterThan(50);

    saveCapabilityMap(tmpDir, record);
    const reloaded = loadCapabilityMap(tmpDir);
    expect(reloaded.models['gemini-2.5-flash']?.runs).toBe(1);
  });

  it('penalizes model on supervisor critical issues', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cav-cap-'));
    const record = loadCapabilityMap(tmpDir);
    updateFromSubAgentResult(record, {
      taskId: '1.1',
      modelId: 'nex-n2-pro',
      ok: true,
      output: '```ts:src/a.ts\ncode\n```',
    });

    updateFromSupervisor(
      record,
      {
        approved: false,
        raw: 'REJECTED',
        summary: 'missing tests',
        issues: [{ severity: 'critical', taskId: '1.1', message: 'no tests' }],
      },
      { '1.1': 'nex-n2-pro' }
    );

    expect(record.models['nex-n2-pro']!.coding).toBeLessThan(70);
  });

  it('formats orchestrator hint from capability map', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cav-cap-'));
    const record = loadCapabilityMap(tmpDir);
    updateFromSubAgentResult(record, {
      taskId: '1.1',
      modelId: 'stepfun-step-3-7-flash',
      ok: true,
      output: '```ts:src/b.ts\ncode\n```',
    });

    const hint = formatCapabilityMapForOrchestrator(record);
    expect(hint).toContain('Capability map');
    expect(hint).toContain('stepfun-step-3-7-flash');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  getCapabilityHintForOrchestrator,
  initSelfAuditRun,
  persistSelfAuditArtifacts,
  processSubAgentSelfAudits,
  processSupervisorSelfAudit,
  selfAuditRecapFields,
} from '../../ai/composer/multi-agent/self-audit-hooks';
import { DEFAULT_MULTI_AGENT_CONFIG } from '../../ai/composer/multi-agent/types';
import type { PipelineMemoryEngine } from '../../ai/composer/multi-agent/pipeline-memory';
import type { SubAgentResult, SupervisorResult } from '../../ai/composer/multi-agent/types';

const tempRoots: string[] = [];

function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-self-audit-'));
  tempRoots.push(root);
  return root;
}

const auditOutput = `
Implementation done.

## Self-Audit
- TaskSuccess: pass
- ToolUseAccuracy: 82
- TrajectoryEfficiency: 71
- TopFailureMode: wrong import path

What rule will you adopt next time?
Prefer workspace-relative imports.

\`\`\`json
{"reasoning":85,"coding":72,"planning":90,"toolUse":63,"failureModes":["wrong import path"]}
\`\`\`
`;

const subAgent: SubAgentResult = {
  taskId: 't1',
  modelId: 'model-a',
  output: auditOutput,
  ok: true,
};

const supervisor: SupervisorResult = {
  approved: true,
  raw: auditOutput,
  issues: [],
  summary: 'Looks good overall',
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('self-audit-hooks', () => {
  it('starts from an empty capability map and returns no orchestrator hint', () => {
    const root = makeWorkspace();
    const ctx = initSelfAuditRun(root);
    expect(ctx.capabilityMap.version).toBe(1);
    expect(ctx.capabilityMap.models).toEqual({});
    expect(getCapabilityHintForOrchestrator(ctx)).toBe('');
  });

  it('skips processing when self-audit is disabled', () => {
    const ctx = initSelfAuditRun(makeWorkspace());
    const onMultiAgentStatus = vi.fn();
    processSubAgentSelfAudits(
      ctx,
      [subAgent],
      { ...DEFAULT_MULTI_AGENT_CONFIG, selfAudit: { ...DEFAULT_MULTI_AGENT_CONFIG.selfAudit!, enabled: false } },
      { onMultiAgentStatus }
    );
    expect(onMultiAgentStatus).not.toHaveBeenCalled();
    expect(ctx.capabilityMap.models).toEqual({});
  });

  it('updates capability map and emits a sub-agent badge from parsed audit', () => {
    const ctx = initSelfAuditRun(makeWorkspace());
    const onMultiAgentStatus = vi.fn();

    processSubAgentSelfAudits(ctx, [subAgent], DEFAULT_MULTI_AGENT_CONFIG, {
      onMultiAgentStatus,
    });

    expect(ctx.capabilityMap.models['model-a']?.runs).toBeGreaterThan(0);
    expect(onMultiAgentStatus).toHaveBeenCalledWith(
      'subagent',
      'done',
      undefined,
      'model-a',
      'subagent-t1',
      expect.any(String)
    );
    expect(getCapabilityHintForOrchestrator(ctx)).toContain('model-a');
  });

  it('records the supervisor improve rule and recap snapshot', () => {
    const ctx = initSelfAuditRun(makeWorkspace());
    const onMultiAgentStatus = vi.fn();

    processSupervisorSelfAudit(ctx, supervisor, { t1: 'model-a' }, DEFAULT_MULTI_AGENT_CONFIG, {
      onMultiAgentStatus,
    });

    expect(ctx.selfAuditSummary).toBe('Prefer workspace-relative imports.');
    expect(onMultiAgentStatus).toHaveBeenCalledWith(
      'supervisor',
      'done',
      undefined,
      undefined,
      'supervisor',
      expect.any(String)
    );
    const recap = selfAuditRecapFields(ctx);
    expect(recap.selfAuditSummary).toBe('Prefer workspace-relative imports.');
  });

  it('falls back to supervisor summary when no improve rule is present', () => {
    const ctx = initSelfAuditRun(makeWorkspace());
    processSupervisorSelfAudit(
      ctx,
      { ...supervisor, raw: 'no audit section', summary: 'Ship the checkout fix' },
      {},
      DEFAULT_MULTI_AGENT_CONFIG
    );
    expect(ctx.selfAuditSummary).toBe('Ship the checkout fix');
  });

  it('persists capability map, preference, and report files when enabled', () => {
    const root = makeWorkspace();
    const ctx = initSelfAuditRun(root);
    processSubAgentSelfAudits(ctx, [subAgent], DEFAULT_MULTI_AGENT_CONFIG);
    processSupervisorSelfAudit(ctx, supervisor, { t1: 'model-a' }, DEFAULT_MULTI_AGENT_CONFIG);

    const appendPreference = vi.fn();
    persistSelfAuditArtifacts(root, 'run-1', ctx, DEFAULT_MULTI_AGENT_CONFIG, {
      appendPreference,
    } as unknown as PipelineMemoryEngine);

    expect(appendPreference).toHaveBeenCalledWith(
      'selfImproveRule:run-1',
      'Prefer workspace-relative imports.'
    );
    const written = fs.readdirSync(root, { recursive: true }).map(String);
    expect(written.some((rel) => rel.endsWith('capability-map.json'))).toBe(true);
    expect(written.some((rel) => rel.endsWith('self-audit-summary.md'))).toBe(true);
    const summaryRel = written.find((rel) => rel.endsWith('self-audit-summary.md'));
    expect(fs.readFileSync(path.join(root, summaryRel!), 'utf8')).toBe(
      'Prefer workspace-relative imports.'
    );
    const reportMapRel = written.find(
      (rel) => rel.endsWith('capability-map.json') && rel.includes('run-1')
    );
    const snapshot = JSON.parse(fs.readFileSync(path.join(root, reportMapRel!), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(snapshot).toHaveProperty('model-a');
  });

  it('does not write pipeline reports when persistReports is off', () => {
    const root = makeWorkspace();
    const ctx = initSelfAuditRun(root);
    ctx.selfAuditSummary = 'keep this in memory only';
    persistSelfAuditArtifacts(root, 'run-2', ctx, {
      ...DEFAULT_MULTI_AGENT_CONFIG,
      selfAudit: { ...DEFAULT_MULTI_AGENT_CONFIG.selfAudit!, persistReports: false },
    });
    const written = fs.readdirSync(root, { recursive: true }).map(String);
    expect(written.some((rel) => rel.includes('run-2'))).toBe(false);
    expect(written.some((rel) => rel.endsWith('capability-map.json'))).toBe(true);
  });
});

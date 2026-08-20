import { describe, expect, it } from 'vitest';

import { loadMultiAgentConfig } from '../../../ai/composer/multi-agent/config';
import { agenticSelfAuditAddon } from '../../../ai/composer/multi-agent/stage-runners';
import { DEFAULT_MULTI_AGENT_CONFIG } from '../../../ai/composer/multi-agent/types';
import { SELF_AUDIT_PROTOCOL } from '../../../ai/prompts/multi-agent/self-audit-protocol';

describe('self-audit config', () => {
  it('defaults selfAudit to enabled', () => {
    const cfg = loadMultiAgentConfig(undefined);
    expect(cfg.selfAudit?.enabled).toBe(true);
  });

  it('injects protocol when selfAudit enabled', () => {
    const addon = agenticSelfAuditAddon({
      ...DEFAULT_MULTI_AGENT_CONFIG,
      selfAudit: { enabled: true, persistReports: true, useProgrammaticScores: true, injectIntoAllAgents: true },
    });
    expect(addon).toContain(SELF_AUDIT_PROTOCOL.slice(0, 40));
  });

  it('skips protocol when selfAudit disabled', () => {
    const addon = agenticSelfAuditAddon({
      ...DEFAULT_MULTI_AGENT_CONFIG,
      selfAudit: { enabled: false, persistReports: false, useProgrammaticScores: true, injectIntoAllAgents: true },
    });
    expect(addon).toBe('');
  });
});

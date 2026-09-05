import React, { useRef } from 'react';
import { useAIStore } from './ai-store';
import { AGENT_MODES, type AgentModeId } from '../modes/agent-modes';
import { useTranslation } from '../i18n/useTranslation';

export function ChatModeSelect({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
  const { t } = useTranslation();
  const { agentMode, setAgentMode } = useAIStore();
  const selectRef = useRef<HTMLSelectElement>(null);
  const activeMode = AGENT_MODES.find((m) => m.id === agentMode) ?? AGENT_MODES[0];
  const compact = variant === 'compact';

  return (
    <div
      data-testid="chat-mode-select"
      style={{ position: 'relative', flexShrink: 0, width: compact ? 'auto' : '100%' }}
    >
      <select
        ref={selectRef}
        value={agentMode}
        onChange={(e) => setAgentMode(e.target.value as AgentModeId)}
        title={activeMode.description}
        aria-label={t('ai.toolbar.mode')}
        style={{
          width: compact ? 'auto' : '100%',
          minWidth: compact ? 72 : undefined,
          padding: compact ? '2px 20px 2px 6px' : '6px 28px 6px 12px',
          borderRadius: compact ? 4 : 8,
          border: '1px solid var(--caval-border)',
          background: 'var(--caval-surface)',
          color: 'var(--caval-text)',
          fontSize: compact ? 10 : 12,
          fontWeight: 500,
          cursor: 'pointer',
          appearance: 'none',
          colorScheme: 'dark',
        }}
      >
        {AGENT_MODES.map((mode) => (
          <option
            key={mode.id}
            value={mode.id}
            title={mode.description}
            style={{ backgroundColor: '#1c1c1c', color: '#f3f3f3' }}
          >
            {mode.shortLabel}
          </option>
        ))}
      </select>
      <span
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 9,
          color: 'var(--caval-text-muted)',
          pointerEvents: 'none',
        }}
      >
        ▾
      </span>
    </div>
  );
}

export type { AgentModeId };

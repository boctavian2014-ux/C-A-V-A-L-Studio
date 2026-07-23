import React, { useRef } from 'react';
import { useAIStore } from './ai-store';
import { AGENT_MODES, type AgentModeId } from '../modes/agent-modes';

export function ChatModeSelect() {
  const { agentMode, setAgentMode } = useAIStore();
  const selectRef = useRef<HTMLSelectElement>(null);
  const activeMode = AGENT_MODES.find((m) => m.id === agentMode) ?? AGENT_MODES[0];

  return (
    <div style={{ position: 'relative', flexShrink: 0, width: '100%' }}>
      <select
        ref={selectRef}
        value={agentMode}
        onChange={(e) => setAgentMode(e.target.value as AgentModeId)}
        title={activeMode.description}
        aria-label="Mod agent"
        style={{
          width: '100%',
          padding: '6px 28px 6px 12px',
          borderRadius: 8,
          border: '1px solid var(--caval-border)',
          background: 'var(--caval-surface)',
          color: 'var(--caval-text)',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          appearance: 'none',
        }}
      >
        {AGENT_MODES.map((mode) => (
          <option key={mode.id} value={mode.id} title={mode.description}>
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

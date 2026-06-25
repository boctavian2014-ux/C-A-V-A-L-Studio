import React from 'react';
import { useAIStore } from './ai-store';
import { AGENT_MODES, type AgentModeId } from '../modes/agent-modes';

export function ChatModeSelect() {
  const { agentMode, setAgentMode } = useAIStore();
  const activeMode = AGENT_MODES.find((m) => m.id === agentMode) ?? AGENT_MODES[1];

  return (
    <div style={{ position: 'relative', flexShrink: 0, width: 80 }}>
      <select
        value={agentMode}
        onChange={(e) => setAgentMode(e.target.value as AgentModeId)}
        title={activeMode.description}
        style={{
          width: '100%',
          padding: '4px 22px 4px 8px',
          borderRadius: 6,
          border: '1px solid var(--caval-border)',
          background: 'var(--caval-bg)',
          color: 'var(--caval-text)',
          fontSize: 11,
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
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 8,
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

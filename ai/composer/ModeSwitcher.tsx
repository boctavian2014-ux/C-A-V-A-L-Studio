import React from 'react';
import { useAIStore } from './ai-store';
import { AGENT_MODES, type AgentModeId } from '../modes/agent-modes';

export function ModeSwitcher() {
  const { agentMode, setAgentMode } = useAIStore();

  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        padding: '4px 10px',
        borderBottom: '1px solid var(--caval-border)',
        flexShrink: 0,
      }}
      role="tablist"
      aria-label="Agent mode"
    >
      {AGENT_MODES.map((mode) => {
        const active = agentMode === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={active}
            title={mode.description}
            onClick={() => setAgentMode(mode.id)}
            style={{
              flex: 1,
              padding: '4px 6px',
              fontSize: 10.5,
              fontWeight: active ? 600 : 400,
              borderRadius: 5,
              border: 'none',
              cursor: 'pointer',
              background: active ? 'var(--caval-accent-glow)' : 'transparent',
              color: active ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
            }}
          >
            {mode.shortLabel}
          </button>
        );
      })}
    </div>
  );
}

export type { AgentModeId };

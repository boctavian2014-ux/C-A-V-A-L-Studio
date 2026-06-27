import React, { useRef } from 'react';
import { useAIStore } from './ai-store';
import { AGENT_MODES, type AgentModeId } from '../modes/agent-modes';

export interface QuickPromptOption {
  label: string;
  text: string;
}

interface ChatModeSelectProps {
  quickPrompts?: QuickPromptOption[];
  onQuickPrompt?: (text: string) => void;
}

export function ChatModeSelect({ quickPrompts = [], onQuickPrompt }: ChatModeSelectProps) {
  const { agentMode, setAgentMode } = useAIStore();
  const selectRef = useRef<HTMLSelectElement>(null);
  const activeMode = AGENT_MODES.find((m) => m.id === agentMode) ?? AGENT_MODES[0];

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value.startsWith('prompt:')) {
      const idx = Number(value.slice('prompt:'.length));
      const prompt = quickPrompts[idx];
      if (prompt && onQuickPrompt) onQuickPrompt(prompt.text);
      if (selectRef.current) selectRef.current.value = agentMode;
      return;
    }
    setAgentMode(value as AgentModeId);
  };

  return (
    <div style={{ position: 'relative', flexShrink: 0, width: '100%' }}>
      <select
        ref={selectRef}
        value={agentMode}
        onChange={handleChange}
        title={activeMode.description}
        style={{
          width: '100%',
          padding: '6px 28px 6px 10px',
          borderRadius: 8,
          border: '1px solid var(--caval-border)',
          background: 'var(--caval-surface)',
          color: 'var(--caval-text)',
          fontSize: 11.5,
          fontWeight: 500,
          cursor: 'pointer',
          appearance: 'none',
        }}
      >
        {quickPrompts.length > 0 && (
          <optgroup label="Prompturi rapide">
            {quickPrompts.map((p, i) => (
              <option key={p.label} value={`prompt:${i}`}>
                {p.label}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Mod agent">
          {AGENT_MODES.map((mode) => (
            <option key={mode.id} value={mode.id} title={mode.description}>
              {mode.shortLabel}
            </option>
          ))}
        </optgroup>
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

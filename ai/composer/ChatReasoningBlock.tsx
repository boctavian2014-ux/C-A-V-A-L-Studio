import React, { useState } from 'react';

interface ChatReasoningBlockProps {
  reasoning: string;
  isStreaming?: boolean;
  defaultExpanded?: boolean;
}

export function ChatReasoningBlock({
  reasoning,
  isStreaming,
  defaultExpanded = true,
}: ChatReasoningBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const showExpanded = isStreaming ? true : expanded;
  const preview = reasoning.trim().slice(0, 120).replace(/\s+/g, ' ');

  if (!reasoning.trim()) return null;

  return (
    <div
      style={{
        marginBottom: 8,
        borderRadius: 6,
        border: '1px solid var(--caval-border)',
        background: 'var(--caval-surface-raised)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: 11,
          color: 'var(--caval-text-muted)',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isStreaming ? 'var(--caval-accent)' : 'var(--caval-success)',
            flexShrink: 0,
            animation: isStreaming ? 'zl-step-pulse 1s ease-in-out infinite' : 'none',
          }}
        />
        <span style={{ fontWeight: 600, color: 'var(--caval-text)' }}>Gândire</span>
        {!showExpanded && preview && (
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.75 }}>
            {preview}…
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.7 }}>
          {showExpanded ? '▾' : '▸'}
        </span>
      </button>
      {showExpanded && (
        <div
          style={{
            padding: '0 10px 8px',
            fontSize: 11.5,
            lineHeight: 1.55,
            color: 'var(--caval-text-muted)',
            whiteSpace: 'pre-wrap',
            maxHeight: 220,
            overflowY: 'auto',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {reasoning}
          {isStreaming && (
            <span
              style={{
                display: 'inline-block',
                width: 2,
                height: '1em',
                marginLeft: 2,
                verticalAlign: 'text-bottom',
                background: 'var(--caval-accent)',
                animation: 'cursor-blink 0.9s step-end infinite',
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

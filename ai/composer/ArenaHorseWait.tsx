import React from 'react';
import { CavaloHorseMark } from '../../src/renderer/components/brand/CavaloHorseMark';
import type { MultiAgentPhase } from './chat-activity-types';
import { getWaitGlowBoxShadow, getWaitGlowFilter } from './arena-wait-copy';

export interface ArenaHorseWaitProps {
  phase?: MultiAgentPhase;
  message: string;
  statusLine?: string;
  visible?: boolean;
}

const COMPOSE_DOT_COLOR = '#22c55e';

function ArenaInlineDots({ color = 'var(--caval-accent)' }: { color?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        marginLeft: 4,
        verticalAlign: 'middle',
      }}
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: color,
            display: 'inline-block',
            animation: `arena-dot-bounce 1.2s ${i * 0.2}s ease-in-out infinite`,
          }}
        />
      ))}
    </span>
  );
}

export function ArenaHorseWait({ phase, message, statusLine, visible = true }: ArenaHorseWaitProps) {
  const isCompose = phase === 'compose';
  const glow = getWaitGlowFilter(phase);
  const boxShadow = getWaitGlowBoxShadow(phase);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '4px 0',
        minHeight: 40,
      }}
    >
      <div
        className="arena-horse-wait-mark"
        style={{
          flexShrink: 0,
          lineHeight: 0,
          borderRadius: 8,
          boxShadow,
          transition: 'box-shadow 0.45s ease',
        }}
      >
        <CavaloHorseMark size={32} glowFilter={glow} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.45,
            color: 'var(--caval-text)',
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.28s ease',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span>{message}</span>
          <ArenaInlineDots color={isCompose ? COMPOSE_DOT_COLOR : 'var(--caval-accent)'} />
        </div>
        {statusLine ? (
          <div
            style={{
              marginTop: 3,
              fontSize: 10.5,
              color: 'var(--caval-text-muted)',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {statusLine}
          </div>
        ) : null}
      </div>
      <style>{`
        .arena-horse-wait-mark img {
          animation: cavalo-gallop 1.4s ease-in-out infinite;
          transition: filter 0.45s ease;
        }
        @keyframes cavalo-gallop {
          0%, 100% { transform: scale(0.92) translateY(0); }
          50% { transform: scale(1) translateY(-3px); }
        }
        @keyframes arena-dot-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

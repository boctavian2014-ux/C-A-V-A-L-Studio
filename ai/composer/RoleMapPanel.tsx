import React, { useState } from 'react';

import { shortModelLabel } from './chat-activity-types';
import type { RoleMapEntry } from './role-map-utils';
import type { PipelineRecapMeta } from './multi-agent/types';

interface RoleMapPanelProps {
  entries: RoleMapEntry[];
  userModel?: string;
  capabilitySnapshot?: PipelineRecapMeta['capabilitySnapshot'];
  defaultCollapsed?: boolean;
}

function capabilityTooltip(
  modelId: string,
  snapshot?: PipelineRecapMeta['capabilitySnapshot']
): string | undefined {
  if (!snapshot) return undefined;
  const scores = snapshot[modelId] ?? snapshot[modelId.split('/').pop() ?? ''];
  if (!scores) return undefined;
  const parts: string[] = [];
  if (scores.reasoning != null) parts.push(`R:${scores.reasoning}`);
  if (scores.coding != null) parts.push(`C:${scores.coding}`);
  if (scores.planning != null) parts.push(`P:${scores.planning}`);
  if (scores.toolUse != null) parts.push(`T:${scores.toolUse}`);
  return parts.length ? `Self-audit ${parts.join(' · ')}` : undefined;
}

function ModelBadge({
  modelId,
  isUserPrimary,
  title,
}: {
  modelId: string;
  isUserPrimary?: boolean;
  title?: string;
}) {
  const tooltip = [title, isUserPrimary ? 'User selection (dropdown)' : undefined].filter(Boolean).join(' — ');
  return (
    <span
      style={{
        fontSize: 9.5,
        fontFamily: 'JetBrains Mono, monospace',
        padding: '1px 6px',
        borderRadius: 4,
        background: isUserPrimary ? 'rgba(99, 102, 241, 0.14)' : 'var(--caval-bg-elevated)',
        border: isUserPrimary
          ? '1px solid rgba(99, 102, 241, 0.45)'
          : '1px solid var(--caval-border)',
        color: 'var(--caval-accent)',
        whiteSpace: 'nowrap',
      }}
      title={tooltip || modelId}
    >
      {shortModelLabel(modelId)}
    </span>
  );
}

export function RoleMapPanel({
  entries,
  capabilitySnapshot,
  defaultCollapsed = true,
}: RoleMapPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (!entries.length) return null;

  return (
    <div
      style={{
        border: '1px solid var(--caval-border)',
        borderRadius: 6,
        background: 'var(--caval-surface-raised)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '6px 10px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--caval-text-muted)',
        }}
      >
        <span>Models by role · {entries.length}</span>
        <span style={{ fontSize: 11, opacity: 0.8 }}>{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(88px, auto) 1fr',
            gap: '4px 10px',
            padding: '4px 10px 8px',
            borderTop: '1px solid var(--caval-border)',
          }}
        >
          {entries.map((entry) => (
            <React.Fragment key={entry.role}>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--caval-text-muted)',
                  alignSelf: 'center',
                }}
              >
                {entry.label}
              </span>
              <span style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <ModelBadge
                  modelId={entry.modelId}
                  isUserPrimary={entry.isUserPrimary}
                  title={capabilityTooltip(entry.modelId, capabilitySnapshot)}
                />
              </span>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

import React from 'react';
import type { CadProviderId, ProviderCostEstimate } from '../../../shared/cad-zoo-contract';

export type ProviderBadgeStatus = 'idle' | 'generating' | 'ready' | 'error';

export interface ProviderBadgeProps {
  provider: CadProviderId;
  status?: ProviderBadgeStatus;
  costEstimate?: ProviderCostEstimate | null;
  showCost?: boolean;
  compact?: boolean;
}

const PROVIDER_META: Record<
  CadProviderId,
  { name: string; color: string }
> = {
  zoo: { name: 'Zoo', color: '#34D399' },
  openscad: { name: 'OpenSCAD', color: '#60A5FA' },
  trellis: { name: 'Trellis', color: '#A78BFA' },
  meshy: { name: 'Meshy', color: '#FBBF24' },
};

/**
 * Compact CAD provider chip with optional Zoo cost estimate.
 * Does not change routing — display-only.
 */
export function ProviderBadge({
  provider,
  status = 'idle',
  costEstimate,
  showCost = true,
  compact = false,
}: ProviderBadgeProps) {
  const meta = PROVIDER_META[provider];
  const showZooCost = showCost && provider === 'zoo' && costEstimate;

  return (
    <div
      data-testid="provider-badge"
      data-provider={provider}
      data-status={status}
      title={costEstimate?.notes}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 4 : 6,
        padding: compact ? '2px 7px' : '4px 10px',
        borderRadius: 999,
        border: `1px solid ${meta.color}55`,
        background: `${meta.color}18`,
        fontSize: compact ? 10.5 : 11.5,
        fontWeight: 600,
        lineHeight: 1.2,
        color: 'var(--caval-text)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: meta.color }}>{meta.name}</span>
      {status === 'generating' ? (
        <span style={{ color: 'var(--caval-text-muted)', fontSize: 10 }}>…</span>
      ) : null}
      {status === 'ready' ? (
        <span style={{ color: '#34D399', fontSize: 10 }}>OK</span>
      ) : null}
      {status === 'error' ? (
        <span style={{ color: '#EF4444', fontSize: 10 }}>ERR</span>
      ) : null}
      {showZooCost ? (
        <span
          data-testid="provider-badge-cost"
          style={{
            padding: '1px 6px',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.28)',
            color: 'var(--caval-text-muted)',
            fontSize: compact ? 10 : 10.5,
            fontWeight: 600,
          }}
        >
          ~${costEstimate.estimatedCostUsd.toFixed(2)}
        </span>
      ) : null}
      {provider === 'zoo' && !compact ? (
        <span
          data-testid="provider-badge-free-tier"
          style={{
            padding: '1px 6px',
            borderRadius: 999,
            background: 'rgba(52,211,153,0.2)',
            color: '#34D399',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          Free tier
        </span>
      ) : null}
    </div>
  );
}

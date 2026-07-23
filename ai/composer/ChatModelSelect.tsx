import React, { useEffect, useMemo, useState } from 'react';
import { useAIStore, getModelDisplayLabel } from './ai-store';
import { ApiKeysModal } from './ApiKeysModal';
import { getChatModelGroups } from '../models/model-catalog';
import { getModelProfileSummary, formatProfileChips } from '../models/model-profile-ui';
import { getModelCodingGuide } from '../models/model-coding-guide';
import {
  modelHealthColor,
  modelHealthLabel,
  type ModelHealthStatus,
} from '../models/model-health';
import type { CavalModelCatalog, CavalModelCatalogEntry } from '../../src/main/preload';

function healthPrefix(status: ModelHealthStatus | undefined): string {
  if (!status || status === 'ready') return '● ';
  if (status === 'missing_key') return '○ ';
  return '◌ ';
}

function renderOptions(
  entries: CavalModelCatalogEntry[],
  health: Record<string, ModelHealthStatus>
) {
  return entries.map((entry) => {
    const status = health[entry.id];
    const healthNote = status && status !== 'ready' ? ` — ${modelHealthLabel(status)}` : '';
    return (
      <option
        key={entry.id}
        value={entry.id}
        title={`${entry.description ?? entry.label}${healthNote}`}
      >
        {healthPrefix(status)}{entry.label}
      </option>
    );
  });
}

interface ChatModelSelectProps {
  catalog: CavalModelCatalog | null;
  loading: boolean;
  /** `stacked` = full-width Robotics layout; `inline` = compact coding chat (default). */
  variant?: 'inline' | 'stacked';
}

export function ChatModelSelect({
  catalog,
  loading,
  variant = 'inline',
}: ChatModelSelectProps) {
  const stacked = variant === 'stacked';
  const { selectedModel, setModel, activeResolvedModel, modelLabels, agentMode } = useAIStore();
  const [showKeys, setShowKeys] = useState(false);
  const [modelHealth, setModelHealth] = useState<Record<string, ModelHealthStatus>>({});

  useEffect(() => {
    void window.caval?.modelsHealth?.().then((res: {
      models?: Record<string, ModelHealthStatus>;
    } | undefined) => {
      if (res?.models) {
        setModelHealth(res.models);
      }
    });
  }, [catalog]);

  const groups = useMemo(
    () => (catalog ? getChatModelGroups(catalog) : { auto: [], free: [], paid: [], coding: [] }),
    [catalog]
  );

  const allEntries = useMemo(
    () => [...groups.auto, ...groups.free, ...groups.paid, ...groups.coding],
    [groups]
  );

  const allIds = useMemo(() => new Set(allEntries.map((e) => e.id)), [allEntries]);

  const catalogEntry = useMemo(
    () => allEntries.find((e) => e.id === selectedModel) ?? null,
    [allEntries, selectedModel]
  );

  const profileSummary = useMemo(
    () => getModelProfileSummary(activeResolvedModel ?? selectedModel, catalogEntry),
    [activeResolvedModel, selectedModel, catalogEntry]
  );

  const codingGuide = useMemo(
    () => getModelCodingGuide(selectedModel, agentMode),
    [selectedModel, agentMode]
  );

  const selectValue = allIds.has(selectedModel) ? selectedModel : 'caval-auto/free';
  const showResolved =
    selectedModel === 'caval-auto/free' && activeResolvedModel != null;
  const resolvedLabel = activeResolvedModel
    ? getModelDisplayLabel(activeResolvedModel, modelLabels)
    : null;

  const selectedHealth = modelHealth[activeResolvedModel ?? selectedModel];
  const healthColor = modelHealthColor(selectedHealth ?? 'unknown');

  const pathLabel =
    codingGuide.path === 'tools'
      ? 'Tools'
      : codingGuide.path === 'agentic-pipeline'
        ? 'Pipeline'
        : 'Fences';

  const codingMetaTitle = codingGuide.canCode
    ? codingGuide.hint || `${pathLabel} · ${codingGuide.requirement}`
    : codingGuide.requirement;

  const stackedMetaParts: string[] = [];
  if (profileSummary.chips.length > 0) {
    stackedMetaParts.push(formatProfileChips(profileSummary.chips));
  }
  if (showResolved && resolvedLabel) {
    stackedMetaParts.push(`→ ${resolvedLabel}`);
  }
  const stackedMetaLine = stackedMetaParts.join(' · ');

  const metaFontSize = stacked ? 11 : 9;
  const metaAlign = stacked ? 'left' as const : 'right' as const;
  const metaMaxWidth = stacked ? undefined : 220;

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: stacked ? 'stretch' : 'flex-end',
          minWidth: 0,
          width: stacked ? '100%' : undefined,
          maxWidth: stacked ? 'none' : 240,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: stacked ? 8 : 4, width: '100%', minWidth: 0 }}>
          {selectedHealth && (
            <span
              title={modelHealthLabel(selectedHealth)}
              style={{
                width: stacked ? 8 : 7,
                height: stacked ? 8 : 7,
                borderRadius: '50%',
                background: healthColor,
                flexShrink: 0,
              }}
            />
          )}
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <select
              value={selectValue}
              disabled={loading}
              onChange={(e) => setModel(e.target.value)}
              title={profileSummary.description || getModelDisplayLabel(selectValue, modelLabels)}
              style={{
                width: '100%',
                minWidth: 0,
                maxWidth: stacked ? 'none' : 200,
                padding: stacked ? '8px 28px 8px 12px' : '6px 28px 6px 12px',
                borderRadius: 8,
                border: '1px solid var(--caval-border)',
                background: 'var(--caval-bg)',
                color: 'var(--caval-text)',
                fontSize: stacked ? 13 : 12,
                fontWeight: 500,
                cursor: loading ? 'wait' : 'pointer',
                appearance: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {groups.auto.length > 0 && (
                <optgroup label="Auto">
                  {renderOptions(groups.auto, modelHealth)}
                </optgroup>
              )}
              {groups.free.length > 0 && (
                <optgroup label="Free">
                  {renderOptions(groups.free, modelHealth)}
                </optgroup>
              )}
              {groups.paid.length > 0 && (
                <optgroup label="Paid">
                  {renderOptions(groups.paid, modelHealth)}
                </optgroup>
              )}
              {groups.coding.length > 0 && (
                <optgroup label="Coding">
                  {renderOptions(groups.coding, modelHealth)}
                </optgroup>
              )}
            </select>
            <span
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: stacked ? 10 : 8,
                color: 'var(--caval-text-muted)',
                pointerEvents: 'none',
              }}
            >
              ▾
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowKeys(true)}
            title="API Keys (BYOK)"
            style={{
              width: stacked ? 32 : 24,
              height: stacked ? 32 : 24,
              borderRadius: 6,
              border: '1px solid var(--caval-border)',
              background: 'none',
              color: 'var(--caval-text-muted)',
              cursor: 'pointer',
              fontSize: stacked ? 13 : 11,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            🔑
          </button>
        </div>

        {selectedHealth && selectedHealth !== 'ready' && (
          <div
            style={{
              fontSize: metaFontSize,
              color: healthColor,
              marginTop: stacked ? 6 : 2,
              textAlign: metaAlign,
              maxWidth: metaMaxWidth,
              lineHeight: 1.4,
            }}
          >
            {modelHealthLabel(selectedHealth)}
          </div>
        )}

        {stacked ? (
          <>
            {!codingGuide.canCode && agentMode !== 'ask' && (
              <div
                style={{
                  fontSize: metaFontSize,
                  color: 'var(--caval-warning, #e6a700)',
                  marginTop: 6,
                  textAlign: 'left',
                  lineHeight: 1.4,
                }}
                title={codingMetaTitle}
              >
                {codingGuide.requirement}
              </div>
            )}
            {stackedMetaLine && (
              <div
                style={{
                  fontSize: metaFontSize,
                  color: 'var(--caval-text-muted)',
                  marginTop: 6,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'left',
                  lineHeight: 1.4,
                }}
                title={[codingMetaTitle, profileSummary.description].filter(Boolean).join('\n')}
              >
                {stackedMetaLine}
              </div>
            )}
          </>
        ) : (
          <>
            {codingGuide.canCode && (
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--caval-text-muted)',
                  marginTop: 2,
                  maxWidth: 220,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  paddingRight: 4,
                  textAlign: 'right',
                }}
                title={codingGuide.hint}
              >
                {pathLabel} · {codingGuide.requirement}
              </div>
            )}

            {!codingGuide.canCode && agentMode !== 'ask' && (
              <div style={{ fontSize: 9, color: 'var(--caval-warning, #e6a700)', marginTop: 2, textAlign: 'right', maxWidth: 220 }}>
                {codingGuide.requirement}
              </div>
            )}

            {profileSummary.chips.length > 0 && (
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--caval-text-muted)',
                  marginTop: 2,
                  maxWidth: 220,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  paddingRight: 4,
                  textAlign: 'right',
                }}
                title={profileSummary.description}
              >
                {formatProfileChips(profileSummary.chips)}
              </div>
            )}

            {showResolved && resolvedLabel && (
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--caval-text-muted)',
                  marginTop: 2,
                  maxWidth: 220,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  paddingRight: 4,
                }}
              >
                → {resolvedLabel}
              </div>
            )}
          </>
        )}
      </div>

      {showKeys && <ApiKeysModal onClose={() => setShowKeys(false)} />}
    </>
  );
}

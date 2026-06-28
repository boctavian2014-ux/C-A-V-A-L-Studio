import React, { useMemo, useState } from 'react';
import { useAIStore, getModelDisplayLabel } from './ai-store';
import { ApiKeysModal } from './ApiKeysModal';
import { getChatModelGroups } from '../models/model-catalog';
import { getModelProfileSummary, formatProfileChips } from '../models/model-profile-ui';
import { getModelCodingGuide } from '../models/model-coding-guide';
import type { CavalModelCatalog, CavalModelCatalogEntry } from '../../src/main/preload';

function renderOptions(entries: CavalModelCatalogEntry[]) {
  return entries.map((entry) => (
    <option key={entry.id} value={entry.id} title={entry.description ?? entry.label}>
      {entry.label}
    </option>
  ));
}

interface ChatModelSelectProps {
  catalog: CavalModelCatalog | null;
  loading: boolean;
}

export function ChatModelSelect({ catalog, loading }: ChatModelSelectProps) {
  const { selectedModel, setModel, activeResolvedModel, modelLabels, agentMode } = useAIStore();
  const [showKeys, setShowKeys] = useState(false);

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

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0, maxWidth: 240 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', minWidth: 0 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <select
              value={selectValue}
              disabled={loading}
              onChange={(e) => setModel(e.target.value)}
              title={profileSummary.description || getModelDisplayLabel(selectValue, modelLabels)}
              style={{
                width: '100%',
                minWidth: 0,
                maxWidth: 200,
                padding: '4px 22px 4px 8px',
                borderRadius: 6,
                border: '1px solid var(--caval-border)',
                background: 'var(--caval-bg)',
                color: 'var(--caval-text)',
                fontSize: 11,
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
                  {renderOptions(groups.auto)}
                </optgroup>
              )}
              {groups.free.length > 0 && (
                <optgroup label="Free">
                  {renderOptions(groups.free)}
                </optgroup>
              )}
              {groups.paid.length > 0 && (
                <optgroup label="Paid">
                  {renderOptions(groups.paid)}
                </optgroup>
              )}
              {groups.coding.length > 0 && (
                <optgroup label="Coding">
                  {renderOptions(groups.coding)}
                </optgroup>
              )}
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

          <button
            type="button"
            onClick={() => setShowKeys(true)}
            title="API Keys (BYOK)"
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              border: '1px solid var(--caval-border)',
              background: 'none',
              color: 'var(--caval-text-muted)',
              cursor: 'pointer',
              fontSize: 11,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            🔑
          </button>
        </div>

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
            {codingGuide.path === 'tools' ? 'Tools' : codingGuide.path === 'agentic-pipeline' ? 'Pipeline' : 'Fences'} · {codingGuide.requirement}
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
      </div>

      {showKeys && <ApiKeysModal onClose={() => setShowKeys(false)} />}
    </>
  );
}

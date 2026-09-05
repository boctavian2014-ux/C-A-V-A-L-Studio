import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

function ModelMenuList({
  groups,
  health,
  selectValue,
  onPick,
}: {
  groups: { label: string; entries: CavalModelCatalogEntry[] }[];
  health: Record<string, ModelHealthStatus>;
  selectValue: string;
  onPick: (id: string) => void;
}) {
  return (
    <>
      {groups.map((group) =>
        group.entries.length === 0 ? null : (
          <div key={group.label} role="group" aria-label={group.label}>
            <div className="caval-model-menu-group" style={{
              padding: '6px 12px 4px',
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--caval-text-muted, #9a9a9a)',
            }}>{group.label}</div>
            {group.entries.map((entry) => {
              const status = health[entry.id];
              const healthNote = status && status !== 'ready' ? ` — ${modelHealthLabel(status)}` : '';
              const selected = entry.id === selectValue;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`caval-model-menu-item${selected ? ' caval-model-menu-item-selected' : ''}`}
                  title={`${entry.description ?? entry.label}${healthNote}`}
                  onClick={() => onPick(entry.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '7px 12px',
                    border: 'none',
                    background: selected ? 'rgba(59,130,246,0.28)' : 'transparent',
                    color: 'var(--caval-text, #f3f3f3)',
                    fontSize: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    className="caval-model-menu-dot"
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: modelHealthColor(status ?? 'unknown'),
                    }}
                    aria-hidden="true"
                  />
                  <span className="caval-model-menu-label">{entry.label}</span>
                </button>
              );
            })}
          </div>
        )
      )}
    </>
  );
}

interface ChatModelSelectProps {
  catalog: CavalModelCatalog | null;
  loading: boolean;
  /** `stacked` = full-width Robotics layout; `inline` = compact coding chat; `compact` = borderless composer row. */
  variant?: 'inline' | 'stacked' | 'compact';
}

export function ChatModelSelect({
  catalog,
  loading,
  variant = 'inline',
}: ChatModelSelectProps) {
  const stacked = variant === 'stacked';
  const compact = variant === 'compact';
  const { selectedModel, setModel, activeResolvedModel, modelLabels, agentMode } = useAIStore();
  const [showKeys, setShowKeys] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 320, maxHeight: 360 });
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
  const selectedLabel = getModelDisplayLabel(selectValue, modelLabels) ||
    allEntries.find((e) => e.id === selectValue)?.label ||
    selectValue;

  useLayoutEffect(() => {
    if (!menuOpen || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const width = Math.min(420, Math.max(280, r.width, window.innerWidth - 16));
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(380, openUp ? spaceAbove : spaceBelow));
    const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
    const top = openUp ? Math.max(8, r.top - maxHeight - 4) : r.bottom + 4;
    setMenuPos({ top, left, width, maxHeight });
  }, [menuOpen, catalog]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <>
      <div
        className={compact ? 'chat-model-select-compact' : undefined}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: stacked ? 'stretch' : compact ? 'center' : 'flex-end',
          minWidth: 0,
          width: stacked ? '100%' : compact ? 'auto' : undefined,
          maxWidth: stacked ? 'none' : compact ? 'none' : 240,
          flex: compact ? '1 1 auto' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: stacked ? 8 : compact ? 6 : 4, width: compact ? 'auto' : '100%', minWidth: 0 }}>
          {selectedHealth && (
            <span
              title={modelHealthLabel(selectedHealth)}
              style={{
                width: stacked ? 8 : compact ? 6 : 7,
                height: stacked ? 8 : compact ? 6 : 7,
                borderRadius: '50%',
                background: healthColor,
                flexShrink: 0,
              }}
            />
          )}
          <div style={{ position: 'relative', flex: compact ? '0 1 auto' : 1, minWidth: 0 }}>
            <button
              ref={triggerRef}
              type="button"
              data-testid="chat-model-select"
              className="caval-model-select-trigger"
              disabled={loading}
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              title={profileSummary.description || selectedLabel}
              style={{
                width: compact ? 'auto' : '100%',
                minWidth: 0,
                maxWidth: stacked ? 'none' : compact ? 160 : 200,
                padding: stacked ? '8px 28px 8px 12px' : compact ? '2px 18px 2px 0' : '6px 28px 6px 12px',
                borderRadius: compact ? 0 : 8,
                border: compact ? 'none' : '1px solid var(--caval-border)',
                background: compact ? 'transparent' : 'var(--caval-bg)',
                color: 'var(--caval-text)',
                fontSize: stacked ? 13 : compact ? 11 : 12,
                fontWeight: 500,
                cursor: loading ? 'wait' : 'pointer',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'left',
              }}
            >
              {healthPrefix(selectedHealth)}{selectedLabel}
            </button>
            <span
              style={{
                position: 'absolute',
                right: compact ? 0 : 8,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: stacked ? 10 : compact ? 7 : 8,
                color: 'var(--caval-text-muted)',
                pointerEvents: 'none',
              }}
            >
              ▾
            </span>
            {menuOpen
              ? createPortal(
                  <div
                    ref={menuRef}
                    role="listbox"
                    aria-label="AI models"
                    className="caval-model-menu"
                    style={{
                      position: 'fixed',
                      zIndex: 10000,
                      top: menuPos.top,
                      left: menuPos.left,
                      width: menuPos.width,
                      maxHeight: menuPos.maxHeight,
                      overflowY: 'auto',
                      background: 'var(--caval-surface, #1c1c1c)',
                      color: 'var(--caval-text, #f3f3f3)',
                      border: '1px solid var(--caval-border, #3a3a3a)',
                      borderRadius: 8,
                      boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
                      padding: '6px 0',
                    }}
                  >
                    <ModelMenuList
                      groups={[
                        { label: 'Auto', entries: groups.auto },
                        { label: 'Free', entries: groups.free },
                        { label: 'Paid', entries: groups.paid },
                        { label: 'Coding', entries: groups.coding },
                      ]}
                      health={modelHealth}
                      selectValue={selectValue}
                      onPick={(id) => {
                        setModel(id);
                        setMenuOpen(false);
                      }}
                    />
                  </div>,
                  document.body
                )
              : null}
          </div>

          {!compact && (
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
          )}
        </div>

        {!compact && selectedHealth && selectedHealth !== 'ready' && (
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
        ) : compact ? null : (
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

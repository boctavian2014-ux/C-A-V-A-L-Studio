import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAIStore, getModelDisplayLabel } from './ai-store';
import { ApiKeysModal } from './ApiKeysModal';
import { getChatModelGroups, isAutoTier } from '../models/model-catalog';
import { getModelProfileSummary, formatProfileChips } from '../models/model-profile-ui';
import { getModelCodingGuide } from '../models/model-coding-guide';
import {
  modelHealthColor,
  modelHealthLabel,
  type ModelHealthStatus,
} from '../models/model-health';
import type { CavalModelCatalog, CavalModelCatalogEntry } from '../../src/main/preload';
import { zIndex } from '../../themes/tokens/z-index';

const UNAVAILABLE_HEALTH: ReadonlySet<ModelHealthStatus> = new Set([
  'missing_key',
  'not_installed',
  'ollama_down',
]);

function optionDomId(modelId: string): string {
  return `caval-model-option-${modelId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function isAutoRoute(entry: CavalModelCatalogEntry): boolean {
  return entry.isAuto === true || isAutoTier(entry.id) || entry.id.startsWith('caval-auto/');
}

function healthFor(
  entry: CavalModelCatalogEntry,
  health: Record<string, ModelHealthStatus>
): ModelHealthStatus {
  return health[entry.id] ?? health[entry.id.replace(/^openrouter:/, '')] ?? 'unknown';
}

function isUnavailable(
  entry: CavalModelCatalogEntry,
  status: ModelHealthStatus
): boolean {
  if (isAutoRoute(entry)) return false;
  return UNAVAILABLE_HEALTH.has(status);
}

function optionCaption(entry: CavalModelCatalogEntry, status: ModelHealthStatus): string {
  if (!isUnavailable(entry, status)) return entry.label;
  return `${entry.label} · ${modelHealthLabel(status)}`;
}

function ModelMenuList({
  groups,
  health,
  selectValue,
  activeId,
  onPick,
}: {
  groups: { label: string; entries: CavalModelCatalogEntry[] }[];
  health: Record<string, ModelHealthStatus>;
  selectValue: string;
  activeId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <>
      {groups.map((group) =>
        group.entries.length === 0 ? null : (
          <div key={group.label} role="group" aria-label={group.label}>
            <div
              className="caval-model-menu-group"
              style={{
                padding: '6px 12px 4px',
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--caval-text-muted)',
              }}
            >
              {group.label}
            </div>
            {group.entries.map((entry) => {
              const status = healthFor(entry, health);
              const unavailable = isUnavailable(entry, status);
              const caption = optionCaption(entry, status);
              const selected = entry.id === selectValue;
              const active = entry.id === activeId;
              return (
                <div
                  key={entry.id}
                  id={optionDomId(entry.id)}
                  role="option"
                  data-model-id={entry.id}
                  aria-selected={selected}
                  aria-disabled={unavailable || undefined}
                  aria-label={caption}
                  title={caption}
                  className={[
                    'caval-model-menu-item',
                    selected ? 'caval-model-menu-item-selected' : '',
                    active ? 'caval-model-menu-item-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={unavailable ? undefined : () => onPick(entry.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '7px 12px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--caval-text)',
                    fontSize: 12,
                    textAlign: 'left',
                    cursor: unavailable ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span
                    className="caval-model-menu-dot"
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: modelHealthColor(status),
                    }}
                    aria-hidden="true"
                  />
                  <span className="caval-model-menu-label" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {entry.label}
                    {unavailable ? (
                      <span className="caval-model-menu-reason" style={{ color: 'var(--caval-text-muted)' }}>
                        {` · ${modelHealthLabel(status)}`}
                      </span>
                    ) : null}
                  </span>
                </div>
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({
    top: 0,
    left: 0,
    width: 320,
    maxHeight: 360,
    placement: 'down' as 'up' | 'down',
  });
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

  const groupedList = useMemo(
    () => [
      { label: 'Auto', entries: groups.auto },
      { label: 'Free', entries: groups.free },
      { label: 'Paid', entries: groups.paid },
      { label: 'Coding', entries: groups.coding },
    ],
    [groups]
  );

  const allEntries = useMemo(
    () => groupedList.flatMap((group) => group.entries),
    [groupedList]
  );

  const allIds = useMemo(() => new Set(allEntries.map((e) => e.id)), [allEntries]);
  const itemIds = useMemo(() => allEntries.map((e) => e.id), [allEntries]);
  const itemIdsRef = useRef(itemIds);
  itemIdsRef.current = itemIds;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

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
  const selectedEntry = allEntries.find((e) => e.id === selectValue);
  const selectedStatus = selectedEntry ? healthFor(selectedEntry, modelHealth) : (selectedHealth ?? 'unknown');
  const selectedUnavailable = selectedEntry ? isUnavailable(selectedEntry, selectedStatus) : false;
  const triggerHint = selectedUnavailable
    ? `${selectedLabel} · ${modelHealthLabel(selectedStatus)}`
    : selectedLabel;

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenuOpen(false);
    setActiveId(null);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  const pickModel = useCallback((id: string) => {
    const entry = allEntries.find((item) => item.id === id);
    if (!entry) return;
    if (isUnavailable(entry, healthFor(entry, modelHealth))) return;
    setModel(id);
    closeMenu(true);
  }, [allEntries, closeMenu, modelHealth, setModel]);

  const pickModelRef = useRef(pickModel);
  pickModelRef.current = pickModel;
  const closeMenuRef = useRef(closeMenu);
  closeMenuRef.current = closeMenu;

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
    setMenuPos({
      top,
      left,
      width,
      maxHeight,
      placement: openUp ? 'up' : 'down',
    });
  }, [menuOpen, catalog]);

  useEffect(() => {
    if (!menuOpen) return;
    setActiveId((current) => current ?? selectValue);
  }, [menuOpen, selectValue]);

  useLayoutEffect(() => {
    if (!menuOpen || !activeId) return;
    const activeOption = document.getElementById(optionDomId(activeId));
    activeOption?.scrollIntoView?.({ block: 'nearest' });
  }, [menuOpen, activeId]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenuRef.current(false);
    };
    const moveActive = (nextIndex: number) => {
      const ids = itemIdsRef.current;
      if (ids.length === 0) return;
      const clamped = Math.min(ids.length - 1, Math.max(0, nextIndex));
      setActiveId(ids[clamped]);
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as Node | null;
      const inWidget =
        (target && triggerRef.current?.contains(target)) ||
        (target && menuRef.current?.contains(target));

      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenuRef.current(true);
        return;
      }

      if (!inWidget) return;

      const ids = itemIdsRef.current;
      const currentIndex = Math.max(0, ids.indexOf(activeIdRef.current ?? ''));

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveActive(currentIndex + 1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveActive(currentIndex - 1);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        moveActive(0);
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        moveActive(ids.length - 1);
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const id = activeIdRef.current;
        if (id) pickModelRef.current(id);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (loading) return;
    if (menuOpen) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setMenuOpen(true);
    }
  };

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
          <div style={{ position: 'relative', flex: compact ? '0 1 auto' : 1, minWidth: 0 }}>
            <button
              ref={triggerRef}
              type="button"
              data-testid="chat-model-select"
              className="caval-model-select-trigger"
              disabled={loading}
              role="combobox"
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? 'caval-model-menu-listbox' : undefined}
              aria-activedescendant={menuOpen && activeId ? optionDomId(activeId) : undefined}
              aria-label={triggerHint}
              onClick={() => {
                if (loading) return;
                setMenuOpen((open) => !open);
              }}
              onKeyDown={onTriggerKeyDown}
              title={triggerHint}
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
              {selectedLabel}
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
              aria-hidden="true"
            >
              ▾
            </span>
            {menuOpen
              ? createPortal(
                  <div
                    ref={menuRef}
                    id="caval-model-menu-listbox"
                    role="listbox"
                    aria-label="AI models"
                    data-testid="chat-model-menu"
                    data-placement={menuPos.placement}
                    className="caval-model-menu"
                    style={{
                      position: 'fixed',
                      zIndex: zIndex.dropdown,
                      top: menuPos.top,
                      left: menuPos.left,
                      width: menuPos.width,
                      maxHeight: menuPos.maxHeight,
                      overflowY: 'auto',
                      background: 'var(--caval-surface)',
                      color: 'var(--caval-text)',
                      border: '1px solid var(--caval-border)',
                      borderRadius: 8,
                      boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
                      padding: '6px 0',
                    }}
                  >
                    <ModelMenuList
                      groups={groupedList}
                      health={modelHealth}
                      selectValue={selectValue}
                      activeId={activeId}
                      onPick={pickModel}
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

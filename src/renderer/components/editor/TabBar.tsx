import React, { useRef, useEffect } from 'react';
import { useEditorStore, type EditorTab } from '../../store/editor-store';

// ──────────────────────────────────────────────
//  Iconuri după extensie (mici, 10px)
// ──────────────────────────────────────────────

const LANG_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  typescript: { bg: 'rgba(49,120,198,0.18)',   color: '#5b9bd5', label: 'ts'   },
  javascript: { bg: 'rgba(245,158,11,0.15)',   color: '#F59E0B', label: 'js'   },
  json:       { bg: 'rgba(212,168,87,0.15)',   color: '#D4A857', label: 'json' },
  markdown:   { bg: 'rgba(138,149,166,0.15)',  color: '#8A95A6', label: 'md'   },
  css:        { bg: 'rgba(97,175,239,0.15)',   color: '#61AFEF', label: 'css'  },
  scss:       { bg: 'rgba(198,120,221,0.15)',  color: '#C678DD', label: 'scss' },
  html:       { bg: 'rgba(229,192,123,0.15)',  color: '#E5C07B', label: 'html' },
  python:     { bg: 'rgba(59,139,235,0.15)',   color: '#3B8BEB', label: 'py'   },
  plaintext:  { bg: 'rgba(138,149,166,0.12)',  color: '#8A95A6', label: 'txt'  },
};

function LangBadge({ language }: { language: string }) {
  const cfg = LANG_COLORS[language] ?? LANG_COLORS.plaintext;
  return (
    <span style={{
      padding: '1px 4px', borderRadius: 3, fontSize: 9,
      background: cfg.bg, color: cfg.color, fontWeight: 600,
      letterSpacing: '0.02em', flexShrink: 0,
    }}>
      {cfg.label}
    </span>
  );
}

// ──────────────────────────────────────────────
//  Singur tab
// ──────────────────────────────────────────────

function Tab({ tab, isActive }: { tab: EditorTab; isActive: boolean }) {
  const { setActiveTab, closeTab, saveTab } = useEditorStore();
  const tabRef = useRef<HTMLDivElement>(null);

  // Scroll în view când devine activ
  useEffect(() => {
    if (isActive && tabRef.current) {
      tabRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [isActive]);

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeTab(tab.id);
  };

  const handleMiddleClick = (e: React.MouseEvent) => {
    if (e.button === 1) closeTab(tab.id);
  };

  const handleDoubleClick = async () => {
    if (tab.isDirty) await saveTab(tab.id);
  };

  return (
    <div
      ref={tabRef}
      onClick={() => setActiveTab(tab.id)}
      onMouseDown={handleMiddleClick}
      onDoubleClick={handleDoubleClick}
      title={`${tab.isAiPreview ? 'Generare AI live · ' : ''}${tab.path}${tab.isDirty ? ' · Nesalvat' : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 12px', height: '100%',
        borderRight: '1px solid var(--caval-border)',
        cursor: 'pointer', whiteSpace: 'nowrap',
        position: 'relative', flexShrink: 0,
        background: isActive ? '#0D1117' : 'transparent',
        color: isActive ? 'var(--caval-text)' : 'var(--caval-text-muted)',
        transition: 'background 0.12s, color 0.12s',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        ...(tab.isAiPreview && isActive ? {
          boxShadow: 'inset 0 -2px 0 #00E0FF',
          color: '#00E0FF',
        } : {}),
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent';
      }}
    >
      {/* Linie cyan sus — tab activ */}
      {isActive && (
        <span style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'var(--caval-accent)',
        }} />
      )}

      <LangBadge language={tab.language} />

      <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {tab.name}
      </span>

      {/* Indicator modificat / buton close */}
      <span
        style={{
          width: 14, height: 14, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, lineHeight: 1, flexShrink: 0,
          color: tab.isDirty ? '#F59E0B' : 'var(--caval-text-muted)',
          background: tab.isDirty ? 'rgba(245,158,11,0.15)' : 'transparent',
          transition: 'all 0.12s',
        }}
        onMouseEnter={(e) => {
          if (!tab.isDirty) {
            e.currentTarget.style.background = 'rgba(239,68,68,0.15)';
            e.currentTarget.style.color = '#EF4444';
          }
        }}
        onMouseLeave={(e) => {
          if (!tab.isDirty) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--caval-text-muted)';
          }
        }}
        onClick={handleClose}
        title={tab.isDirty ? 'Nesalvat — Click Ctrl+S ca să salvezi' : 'Închide'}
      >
        {tab.isDirty ? '●' : '×'}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────
//  TabBar
// ──────────────────────────────────────────────

export function TabBar() {
  const { tabs, activeTabId } = useEditorStore();

  if (tabs.length === 0) {
    return (
      <div style={{
        height: 36, background: '#0A0A0B',
        borderBottom: '1px solid var(--caval-border)',
      }} />
    );
  }

  return (
    <div style={{
      height: 36,
      background: '#0A0A0B',
      borderBottom: '1px solid var(--caval-border)',
      display: 'flex',
      alignItems: 'stretch',
      overflowX: 'auto',
      overflowY: 'hidden',
    }}
    // Scroll cu mouse wheel orizontal
    onWheel={(e) => {
      e.currentTarget.scrollLeft += e.deltaY;
    }}
    >
      {tabs.map((tab) => (
        <Tab key={tab.id} tab={tab} isActive={activeTabId === tab.id} />
      ))}
    </div>
  );
}

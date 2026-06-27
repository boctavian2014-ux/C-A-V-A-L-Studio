import React from 'react';
import { useEditorStore } from '../../store/editor-store';
import { SidebarToggleButton } from './SidebarCloseButton';
import { CavaloLogo } from '../brand/CavaloHorseMark';

export interface WorkbenchHeaderProps {
  engineeringOpen: boolean;
  onToggleEngineering: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function WorkbenchHeader({
  engineeringOpen,
  onToggleEngineering,
  sidebarOpen,
  onToggleSidebar,
}: WorkbenchHeaderProps) {
  const { projectPath, tabs, activeTabId } = useEditorStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const pathLabel = activeTab?.path
    ?? (projectPath ? projectPath.split(/[/\\]/).pop() : null)
    ?? 'Fără proiect deschis';

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '0 12px',
        minHeight: 38,
        borderBottom: '1px solid var(--caval-border)',
        borderTop: '2px solid var(--caval-accent)',
        background: '#111214',
        color: 'var(--caval-text-muted)',
        fontSize: 12,
        flexShrink: 0,
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 0,
        flex: 1,
      }}>
        <span style={{ flexShrink: 0 }}>
          <CavaloLogo height={24} />
        </span>
        <span style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: '#6f7a89',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
        }}>
          {pathLabel}
        </span>
      </div>

      <nav
        aria-label="Workbench toolbar"
        style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
      >
        <SidebarToggleButton sidebarOpen={sidebarOpen} onClick={onToggleSidebar} />
        <button
          type="button"
          title="Engineering AI"
          aria-label="Engineering AI"
          aria-pressed={engineeringOpen}
          onClick={onToggleEngineering}
          style={{
            height: 30,
            padding: '0 10px',
            border: engineeringOpen ? '1px solid var(--caval-accent)' : '1px solid var(--caval-border)',
            borderRadius: 8,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: engineeringOpen ? 'var(--caval-accent)' : 'var(--caval-surface)',
            color: engineeringOpen ? '#0E0E0F' : 'var(--caval-text-muted)',
            fontSize: 11,
            fontWeight: 600,
            transition: 'background 0.15s, color 0.15s, border-color 0.15s',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="3" y="8" width="18" height="12" rx="2" />
            <path d="M7 8V5a2 2 0 012-2h6a2 2 0 012 2v3" />
          </svg>
          Engineering AI
        </button>
      </nav>
    </header>
  );
}

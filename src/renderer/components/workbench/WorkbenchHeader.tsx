import React from 'react';
import { SidebarToggleButton } from './SidebarCloseButton';
import { CavaloLogo } from '../brand/CavaloHorseMark';
import { dispatchTerminalNew, dispatchTerminalToggle } from '../../terminal/terminal-events';

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
  return (
    <header
      className="glass-panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '0 12px',
        minHeight: 38,
        borderBottom: '1px solid var(--caval-glass-border, rgba(255,255,255,0.08))',
        borderTop: '2px solid var(--caval-accent)',
        borderLeft: 'none',
        borderRight: 'none',
        color: 'var(--caval-text-muted)',
        fontSize: 12,
        flexShrink: 0,
        zIndex: 15,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          minWidth: 0,
          flex: 1,
        }}
      >
        <CavaloLogo height={24} />
      </div>

      <nav
        aria-label="Workbench toolbar"
        style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
      >
        <SidebarToggleButton sidebarOpen={sidebarOpen} onClick={onToggleSidebar} />
        <button
          type="button"
          className="glass-panel-interactive"
          title="Terminal nou (Ctrl+Shift+`)"
          aria-label="Terminal nou"
          onClick={() => dispatchTerminalNew()}
          onContextMenu={(e) => {
            e.preventDefault();
            dispatchTerminalToggle();
          }}
          style={{
            height: 30,
            width: 30,
            padding: 0,
            borderRadius: 8,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--caval-text-muted)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </button>
        <button
          type="button"
          className={engineeringOpen ? 'glow-accent' : 'glass-panel-interactive'}
          title="Robotics AI ULTRA"
          aria-label="Robotics AI ULTRA"
          aria-pressed={engineeringOpen}
          onClick={onToggleEngineering}
          style={{
            height: 30,
            padding: '0 10px',
            border: engineeringOpen ? '1px solid var(--caval-accent)' : undefined,
            borderRadius: 8,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: engineeringOpen ? 'var(--caval-accent)' : undefined,
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
          Robotics AI
        </button>
      </nav>
    </header>
  );
}

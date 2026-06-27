import React from 'react';

export function SidebarCloseButton({
  onClick,
  title = 'Închide sidebar (Ctrl+B)',
  style,
}: {
  onClick: () => void;
  title?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        width: 22,
        height: 22,
        borderRadius: 4,
        border: 'none',
        background: 'transparent',
        color: 'var(--caval-text-muted)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 0.12s, color 0.12s',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--caval-surface-raised)';
        e.currentTarget.style.color = 'var(--caval-text)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--caval-text-muted)';
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 3L5 8l5 5" />
        <path d="M5 8h9" />
      </svg>
    </button>
  );
}

export function SidebarToggleButton({
  onClick,
  sidebarOpen,
}: {
  onClick: () => void;
  sidebarOpen: boolean;
}) {
  const title = sidebarOpen ? 'Ascunde sidebar (Ctrl+B)' : 'Arată sidebar (Ctrl+B)';
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={sidebarOpen}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        padding: 0,
        border: sidebarOpen ? '1px solid var(--caval-border)' : '1px solid transparent',
        borderRadius: 8,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: sidebarOpen ? 'var(--caval-surface)' : 'transparent',
        color: sidebarOpen ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
        <rect x="2" y="3" width="12" height="10" rx="1" />
        <path d="M6 3v10" />
        {!sidebarOpen && <path d="M9 8h3M11 6.5v3" />}
      </svg>
    </button>
  );
}

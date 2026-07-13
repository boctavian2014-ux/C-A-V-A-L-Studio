import React, { useCallback, useState } from 'react';
import { useEditorStore, type FileNode } from '../../store/editor-store';
import { useOpenWorkspace } from '../../hooks/useOpenWorkspace';
import { useCavalTheme } from '../../../../themes/theme-provider';
import { SidebarCloseButton } from '../workbench/SidebarCloseButton';
import { Cavalo3DIcon } from '../brand/Cavalo3DIcon';
import { IconFolder } from '../brand/CavaloIcons';

// ──────────────────────────────────────────────
//  Iconuri fișiere după extensie
// ──────────────────────────────────────────────

const FILE_ICON_COLORS: Record<string, string> = {
  ts: '#5b9bd5', tsx: '#00E0FF', js: '#F59E0B', jsx: '#F59E0B',
  json: '#D4A857', md: '#8A95A6', css: '#61AFEF', scss: '#C678DD',
  html: '#E5C07B', py: '#3B8BEB', rs: '#EF4444', go: '#00ADD8',
  sh: '#2FBF71', yaml: '#98C379', yml: '#98C379', env: '#8A95A6',
};

const DIR_COLORS: Record<string, string> = {
  src: '#5b9bd5', ai: '#C678DD', themes: '#2FBF71',
  billing: '#D4A857', mobile: '#F59E0B', marketplace: '#EF4444',
  tests: '#8A95A6', '.cicd': '#8A95A6',
};

function FileIcon({ ext }: { ext?: string }) {
  const color = FILE_ICON_COLORS[ext ?? ''] ?? '#8A95A6';
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <rect x="2" y="1" width="9" height="13" rx="1.5" stroke={color} strokeWidth="1.2" />
      <path d="M8 1v4h3" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function DirIcon({ name, open }: { name: string; open: boolean }) {
  const color = DIR_COLORS[name] ?? (open ? '#00E0FF' : '#8A95A6');
  return (
    <span style={{ color, display: 'inline-flex', flexShrink: 0 }}>
      <IconFolder size={14} strokeWidth={1.5} open={open} />
    </span>
  );
}

// ──────────────────────────────────────────────
//  Context Menu
// ──────────────────────────────────────────────

interface ContextMenuState {
  x: number; y: number;
  node: FileNode;
}

function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const { refreshTree } = useEditorStore();

  const handle = async (action: string) => {
    onClose();
    if (action === 'reveal') {
      await window.caval.fs.reveal(state.node.path);
    } else if (action === 'delete') {
      if (confirm(`Ștergi "${state.node.name}"?`)) {
        await window.caval.fs.delete(state.node.path);
        await refreshTree();
      }
    } else if (action === 'newFile' && state.node.type === 'directory') {
      const name = prompt('Nume fișier nou:');
      if (name) {
        const newPath = `${state.node.path}/${name}`.replace(/\\/g, '/');
        await window.caval.fs.createFile(newPath);
        await refreshTree();
      }
    } else if (action === 'newDir' && state.node.type === 'directory') {
      const name = prompt('Nume director nou:');
      if (name) {
        const newPath = `${state.node.path}/${name}`.replace(/\\/g, '/');
        await window.caval.fs.createDir(newPath);
        await refreshTree();
      }
    }
  };

  return (
    <div
      style={{
        position: 'fixed', top: state.y, left: state.x,
        background: 'var(--caval-surface)', border: '1px solid var(--caval-border)',
        borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        zIndex: 9999, minWidth: 160, padding: '4px 0',
      }}
    >
      {state.node.type === 'directory' && (
        <>
          <MenuItem label="Fișier nou" onClick={() => handle('newFile')} />
          <MenuItem label="Director nou" onClick={() => handle('newDir')} />
          <div style={{ height: 1, background: 'var(--caval-border)', margin: '4px 0' }} />
        </>
      )}
      <MenuItem label="Deschide în Explorer" onClick={() => handle('reveal')} />
      <div style={{ height: 1, background: 'var(--caval-border)', margin: '4px 0' }} />
      <MenuItem label="Șterge" onClick={() => handle('delete')} danger />
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '6px 14px', fontSize: 12, cursor: 'pointer',
        color: danger ? 'var(--caval-error)' : 'var(--caval-text)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--caval-surface-raised)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </div>
  );
}

// ──────────────────────────────────────────────
//  TreeNode — un singur nod din arbore
// ──────────────────────────────────────────────

function TreeNode({
  node,
  depth,
  onContextMenu,
}: {
  node: FileNode;
  depth: number;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
}) {
  const { activeTabId, openFile, expandedDirs, toggleDir } = useEditorStore();
  const isActive = node.type === 'file' && activeTabId === node.id;
  const isOpen = expandedDirs.has(node.path);

  const handleClick = useCallback(() => {
    if (node.type === 'directory') {
      toggleDir(node.path);
    } else {
      openFile(node.path);
    }
  }, [node, openFile, toggleDir]);

  return (
    <>
      <div
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: `3px 8px 3px ${8 + depth * 14}px`,
          cursor: 'pointer',
          background: isActive ? 'var(--caval-accent-glow)' : 'transparent',
          color: isActive ? 'var(--caval-accent)' : 'var(--caval-text)',
          borderRadius: 4,
          margin: '0 4px',
          fontSize: 12.5,
          fontFamily: 'var(--font-mono)',
          transition: 'background 0.1s',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = 'rgba(138,149,166,0.08)';
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = 'transparent';
        }}
      >
        {/* Arrow pentru directoare */}
        <span style={{
          width: 12, fontSize: 9, color: 'var(--caval-text-muted)',
          transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s', flexShrink: 0,
          opacity: node.type === 'directory' ? 1 : 0,
        }}>
          ▶
        </span>

        {/* Icon */}
        {node.type === 'directory'
          ? <DirIcon name={node.name} open={isOpen} />
          : <FileIcon ext={node.ext} />
        }

        {/* Nume */}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {node.name}
        </span>
      </div>

      {/* Children */}
      {node.type === 'directory' && isOpen && node.children?.map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          onContextMenu={onContextMenu}
        />
      ))}
    </>
  );
}

// ──────────────────────────────────────────────
//  FileTree — componenta principală
// ──────────────────────────────────────────────

export function FileTree({ onClose }: { onClose?: () => void }) {
  const { fileTree, projectPath, refreshTree } = useEditorStore();
  const { theme } = useCavalTheme();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const { pickAndOpenFolder } = useOpenWorkspace();

  const handleOpenFolder = async () => {
    await pickAndOpenFolder();
  };

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const projectName = projectPath?.split(/[/\\]/).pop() ?? 'Fără proiect';

  return (
    <div style={{
      width: 240,
      background: theme.colors.surface,
      borderRight: `1px solid ${theme.colors.border}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      userSelect: 'none',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${theme.colors.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: theme.colors.textMuted,
        }}>
          {projectName}
        </span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <IconBtn title="Deschide folder" onClick={handleOpenFolder}>
            <Cavalo3DIcon name="home" size={18} />
          </IconBtn>
          <IconBtn title="Reîmprospătează" onClick={refreshTree}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2 8a6 6 0 106-6H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M3 5l2-3-2-0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </IconBtn>
          {onClose && <SidebarCloseButton onClick={onClose} />}
        </div>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}
        onClick={() => contextMenu && setContextMenu(null)}
      >
        {fileTree.length === 0 ? (
          <div style={{
            padding: '24px 16px', textAlign: 'center',
            color: theme.colors.textMuted, fontSize: 12, lineHeight: 1.6,
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <Cavalo3DIcon name="home" size={44} />
            </div>
            <div>Deschide un folder</div>
            <div>pentru a începe</div>
            <button
              onClick={handleOpenFolder}
              style={{
                marginTop: 12, padding: '6px 14px',
                background: 'var(--caval-accent)', color: '#0E0E0F',
                border: 'none', borderRadius: 6, fontSize: 12,
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              Deschide proiect
            </button>
          </div>
        ) : (
          fileTree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              onContextMenu={handleContextMenu}
            />
          ))
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setContextMenu(null)}
          />
          <ContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
        </>
      )}
    </div>
  );
}

// Helper buton icon
function IconBtn({ title, onClick, children }: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 22, height: 22, borderRadius: 4,
        border: 'none', background: 'none',
        color: 'var(--caval-text-muted)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--caval-surface-raised)';
        e.currentTarget.style.color = 'var(--caval-text)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none';
        e.currentTarget.style.color = 'var(--caval-text-muted)';
      }}
    >
      {children}
    </button>
  );
}

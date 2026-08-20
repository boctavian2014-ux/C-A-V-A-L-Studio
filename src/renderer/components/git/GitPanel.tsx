import React, { useEffect, useCallback, useRef, useState } from 'react';
import type { GitApi, GitOperationState, GitStatus } from '../../../shared/git-contract';
import { useGitStore, type GitFileStatus, type GitCommit } from '../../store/git-store';
import { GitDiffPanel } from './GitDiffPanel';

// ──────────────────────────────────────────────
//  Culori status fișier
// ──────────────────────────────────────────────

function statusColor(s: string): string {
  switch (s) {
    case 'M':
    case 'modified':
      return '#E2C08D';
    case 'A':
    case 'added':
      return '#2FBF71';
    case 'D':
    case 'deleted':
      return '#F47067';
    case 'R':
    case 'renamed':
    case 'C':
    case 'copied':
      return '#78B9E0';
    case 'U':
    case 'conflicted':
      return '#F47067';
    case '?':
    case 'untracked':
    case '!':
    case 'ignored':
      return '#909090';
    default:
      return '#909090';
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case 'modified':
      return 'M';
    case 'added':
      return 'A';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'copied':
      return 'C';
    case 'untracked':
      return 'U';
    case 'ignored':
      return '!';
    case 'conflicted':
      return 'U';
    default:
      return s;
  }
}

function operationFeedback(operation: { operation: string; status: string } | null): string | null {
  if (!operation || operation.status !== 'running') return null;
  switch (operation.operation) {
    case 'stage':
      return 'Staging…';
    case 'unstage':
      return 'Unstaging…';
    case 'commit':
      return 'Committing…';
    case 'checkout':
      return 'Checking out…';
    case 'push':
      return 'Pushing…';
    case 'pull':
      return 'Pulling…';
    case 'stash':
      return 'Stashing…';
    case 'init':
      return 'Initializing…';
    case 'clone':
      return 'Cloning…';
    default:
      return 'Working…';
  }
}

// ──────────────────────────────────────────────
//  FileRow — un fișier în lista de changes
// ──────────────────────────────────────────────

function FileRow({
  file,
  isSelected,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
  busy,
}: {
  file: GitFileStatus;
  isSelected: boolean;
  onSelect: () => void;
  onStage: () => void;
  onUnstage: () => void;
  onDiscard: () => void;
  busy?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const fileName = file.path.split('/').pop() || file.path;
  const dirPart = file.path.includes('/')
    ? file.path.substring(0, file.path.lastIndexOf('/'))
    : '';

  return (
    <div
      data-testid="git-file"
      data-path={file.path}
      data-staged={file.staged ? 'true' : 'false'}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center',
        padding: '3px 10px 3px 14px',
        gap: 6, cursor: 'pointer',
        background: isSelected
          ? 'rgba(0, 224, 255, 0.07)'
          : hovered ? 'var(--caval-surface-raised)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--caval-accent)' : '2px solid transparent',
        transition: 'background 0.1s',
      }}
    >
      {/* Status badge */}
      <span style={{
        fontSize: 10, fontWeight: 700, width: 14, textAlign: 'center',
        color: statusColor(file.status), flexShrink: 0,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {statusLabel(file.status)}
      </span>

      {/* Cale fișier */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--caval-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileName}
        </div>
        {dirPart && (
          <div style={{ fontSize: 10, color: 'var(--caval-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {dirPart}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {file.status !== 'deleted' && !file.staged && (
            <MicroBtn title="Discard changes" onClick={onDiscard} danger>
              {/* undo icon */}
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 7l-3 3 3 3M0 10h9a4 4 0 000-8H7" />
              </svg>
            </MicroBtn>
          )}
          {file.staged ? (
            <MicroBtn title="Unstage" testId="git-unstage" onClick={onUnstage} disabled={busy}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2l-6 6h4v6h4V8h4L8 2z" />
              </svg>
            </MicroBtn>
          ) : (
            <MicroBtn title="Stage" testId="git-stage" onClick={onStage} accent disabled={busy}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 14l6-6h-4V2H6v6H2l6 6z" />
              </svg>
            </MicroBtn>
          )}
        </div>
    </div>
  );
}

function MicroBtn({
  title, onClick, children, danger, accent, disabled, testId,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  accent?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      title={title}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 20, height: 20, borderRadius: 3,
        border: 'none', background: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: danger ? '#F47067' : accent ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
        transition: 'all 0.1s',
        opacity: disabled ? 0.45 : 1,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
    >
      {children}
    </button>
  );
}

// ──────────────────────────────────────────────
//  SectionHeader
// ──────────────────────────────────────────────

function SectionHeader({
  label, count, onStageAll, onUnstageAll, staged,
}: {
  label: string;
  count: number;
  staged: boolean;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '5px 10px 3px 10px',
      gap: 6,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--caval-text-muted)' }}>
        {label}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 999,
        background: 'rgba(255,255,255,0.07)', color: 'var(--caval-text-muted)',
      }}>
        {count}
      </span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
        {staged && onUnstageAll && (
          <MicroBtn title="Unstage all" onClick={onUnstageAll}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2l-6 6h4v6h4V8h4L8 2z" />
            </svg>
          </MicroBtn>
        )}
        {!staged && onStageAll && (
          <MicroBtn title="Stage all" onClick={onStageAll} accent>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 14l6-6h-4V2H6v6H2l6 6z" />
            </svg>
          </MicroBtn>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
//  CommitHistory tab
// ──────────────────────────────────────────────

function CommitRow({ commit }: { commit: GitCommit }) {
  const [hovered, setHovered] = useState(false);

  const date = new Date(commit.date);
  const relDate = formatRelDate(date);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '7px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: hovered ? 'var(--caval-surface-raised)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5,
          color: 'var(--caval-accent)', flexShrink: 0,
        }}>
          {commit.shortHash}
        </span>
        {commit.refs && (
          <span style={{
            fontSize: 9.5, padding: '1px 5px', borderRadius: 3,
            background: 'rgba(0,224,255,0.08)', color: 'var(--caval-accent)',
            border: '1px solid rgba(0,224,255,0.15)', flexShrink: 0,
          }}>
            {commit.refs.split(',')[0].trim().replace('HEAD -> ', '')}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--caval-text-muted)', flexShrink: 0 }}>
          {relDate}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--caval-text)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {commit.subject}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--caval-text-muted)', marginTop: 1 }}>
        {commit.author}
      </div>
    </div>
  );
}

function formatRelDate(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'acum';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}z`;
  return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
}

// ──────────────────────────────────────────────
//  Branch Picker overlay
// ──────────────────────────────────────────────

function BranchPicker() {
  const {
    branches, branch, newBranchName,
    checkout, createBranch,
    setShowBranchPicker, setNewBranchName,
    loadBranches,
  } = useGitStore();

  const [mode, setMode] = useState<'list' | 'new'>('list');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    if (mode === 'new') inputRef.current?.focus();
  }, [mode]);

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 499 }}
        onClick={() => setShowBranchPicker(false)}
      />
      <div style={{
        position: 'absolute', top: '100%', left: 0, right: 0,
        background: 'var(--caval-surface)', border: '1px solid var(--caval-border)',
        borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        zIndex: 500, marginTop: 4, overflow: 'hidden', maxHeight: 260,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', padding: '7px 10px', borderBottom: '1px solid var(--caval-border)', gap: 4 }}>
          <button
            onClick={() => setMode('list')}
            style={{
              flex: 1, padding: '3px 0', borderRadius: 4, border: 'none',
              background: mode === 'list' ? 'rgba(0,224,255,0.1)' : 'transparent',
              color: mode === 'list' ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
              fontSize: 11, cursor: 'pointer',
            }}
          >
            Branch-uri
          </button>
          <button
            onClick={() => setMode('new')}
            style={{
              flex: 1, padding: '3px 0', borderRadius: 4, border: 'none',
              background: mode === 'new' ? 'rgba(0,224,255,0.1)' : 'transparent',
              color: mode === 'new' ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
              fontSize: 11, cursor: 'pointer',
            }}
          >
            + Branch nou
          </button>
        </div>

        {mode === 'list' ? (
          <div style={{ overflowY: 'auto', flex: 1 }} className="ai-messages-scroll">
            {branches.map((b) => (
              <button
                key={b.name}
                onClick={() => checkout(b.name)}
                style={{
                  width: '100%', padding: '6px 12px', border: 'none', textAlign: 'left',
                  background: b.name === branch ? 'rgba(0,224,255,0.07)' : 'transparent',
                  color: b.name === branch ? 'var(--caval-accent)' : 'var(--caval-text)',
                  cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
                }}
                onMouseEnter={(e) => { if (b.name !== branch) e.currentTarget.style.background = 'var(--caval-surface-raised)'; }}
                onMouseLeave={(e) => { if (b.name !== branch) e.currentTarget.style.background = 'transparent'; }}
              >
                {b.name === branch && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="var(--caval-accent)">
                    <circle cx="5" cy="5" r="5" />
                  </svg>
                )}
                {b.name}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ padding: '10px 12px', display: 'flex', gap: 6 }}>
            <input
              ref={inputRef}
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createBranch(newBranchName); }}
              placeholder="Nume branch nou…"
              style={{
                flex: 1, background: 'var(--caval-surface-raised)', border: '1px solid var(--caval-border)',
                borderRadius: 5, padding: '5px 8px', color: 'var(--caval-text)',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12, outline: 'none',
              }}
            />
            <button
              onClick={() => createBranch(newBranchName)}
              style={{
                padding: '5px 10px', borderRadius: 5,
                background: 'var(--caval-accent)', border: 'none',
                color: '#0E0E0F', fontWeight: 600, fontSize: 12, cursor: 'pointer',
              }}
            >
              Crează
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────
//  GitPanel — componenta principală
// ──────────────────────────────────────────────

export function GitPanel() {
  const {
    isRepo, branch, upstream, ahead, behind,
    files, activeTab, selectedFile,
    commitMessage, loading, opLoading, opResult, error, operation,
    showBranchPicker,
    refresh, applyStatus, setOperation, loadDiff, stage, unstage, stageAll, unstageAll, discard,
    commit, push, pull, loadLog, commits,
    setActiveTab, setCommitMessage, setShowBranchPicker,
    stash, stashPop,
  } = useGitStore();

  useEffect(() => {
    let cancelled = false;
    const git = window.caval?.git as unknown as GitApi | undefined;

    const runRefresh = async () => {
      if (!git?.status) {
        if (!cancelled) {
          useGitStore.setState({ loading: false, error: 'Git API unavailable' });
        }
        return;
      }
      try {
        const status = await git.status();
        if (!cancelled) applyStatus(status);
      } catch (err) {
        if (!cancelled) {
          useGitStore.setState({
            loading: false,
            error: err instanceof Error ? err.message : 'Git status failed',
          });
        }
      }
    };

    void runRefresh();
    const unsubscribeStatus = git?.onStatusChange((status: GitStatus) => {
      if (!cancelled) applyStatus(status);
    }) ?? (() => undefined);
    const unsubscribeOperation = git?.onOperationChange((state: GitOperationState) => {
      if (!cancelled) setOperation(state);
    }) ?? (() => undefined);

    return () => {
      cancelled = true;
      unsubscribeStatus();
      unsubscribeOperation();
    };
  }, [applyStatus, setOperation]);

  useEffect(() => {
    const handler = () => {
      void refresh();
    };
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, [refresh]);

  useEffect(() => {
    if (activeTab === 'history') void loadLog();
  }, [activeTab, loadLog]);

  const stagedFiles   = files.filter((f) => f.staged);
  const unstagedFiles = files.filter((f) => !f.staged);
  const canCommit = stagedFiles.length > 0 && Boolean(commitMessage.trim()) && !opLoading;
  const runningFeedback = operationFeedback(operation);
  const busyOp = operation?.status === 'running' ? operation.operation : null;

  const handleFileClick = useCallback((file: GitFileStatus) => {
    void loadDiff(file);
  }, [loadDiff]);

  if (!isRepo && !loading) {
    return (
      <EmptyState
        icon={<GitIcon />}
        title={error ? 'Git indisponibil' : 'Nu este un repo Git'}
        desc={error ?? 'Directorul curent nu are un repo Git inițializat.'}
        alert={error}
        action={error ? undefined : { label: 'git init', onClick: () => void useGitStore.getState().initRepo() }}
      />
    );
  }

  return (
    <div
      data-testid="git-panel"
      style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
      background: 'var(--caval-bg)',
    }}>

      {/* ── Header ─────────────────────────── */}
      <div style={{
        padding: '10px 12px 8px',
        borderBottom: '1px solid var(--caval-border)',
        flexShrink: 0,
      }}>
        {/* Branch selector */}
        <div style={{ position: 'relative', marginBottom: 6 }}>
          <button
            onClick={() => setShowBranchPicker(!showBranchPicker)}
            style={{
              width: '100%', padding: '5px 10px',
              background: 'var(--caval-surface)', border: '1px solid var(--caval-border)',
              borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              color: 'var(--caval-text)', fontSize: 12,
            }}
          >
            {/* Branch icon */}
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--caval-accent)" strokeWidth="1.6">
              <circle cx="5" cy="3" r="1.5" /><circle cx="5" cy="13" r="1.5" /><circle cx="11" cy="8" r="1.5" />
              <path d="M5 4.5v7M5 4.5C5 6.5 11 6.5 11 8" />
            </svg>
            <span style={{ flex: 1, textAlign: 'left', fontFamily: "'JetBrains Mono', monospace" }}>
              {branch || '—'}
              {upstream ? (
                <span style={{ color: 'var(--caval-text-muted)', fontWeight: 400 }}>
                  {' '}→ {upstream}
                </span>
              ) : null}
            </span>
            {/* Ahead/behind */}
            {(ahead > 0 || behind > 0) && (
              <span style={{ fontSize: 10, color: 'var(--caval-text-muted)', display: 'flex', gap: 4 }}>
                {behind > 0 && <span title={`${behind} commits în spate`}>↓{behind}</span>}
                {ahead  > 0 && <span title={`${ahead} commits înainte`}>↑{ahead}</span>}
              </span>
            )}
            <span style={{ fontSize: 10, color: 'var(--caval-text-muted)' }}>▾</span>
          </button>
          {showBranchPicker && <BranchPicker />}
        </div>

        {/* Push / Pull / Refresh */}
        <div style={{ display: 'flex', gap: 4 }}>
          <ActionBtn
            title="Pull"
            onClick={pull}
            disabled={opLoading || busyOp === 'pull'}
            icon={
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M8 2v10M3 9l5 5 5-5" />
              </svg>
            }
          >
            Pull
          </ActionBtn>
          <ActionBtn
            title="Push"
            onClick={push}
            disabled={opLoading || busyOp === 'push'}
            accent
            icon={
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M8 14V4M3 7l5-5 5 5" />
              </svg>
            }
          >
            Push {ahead > 0 ? `(${ahead})` : ''}
          </ActionBtn>
          <button
            data-testid="git-refresh"
            onClick={() => void refresh()}
            disabled={loading}
            title="Refresh status"
            style={{
              width: 28, height: 28, borderRadius: 5, border: '1px solid var(--caval-border)',
              background: 'var(--caval-surface)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--caval-text-muted)',
              animation: loading ? 'caval-spin 1s linear infinite' : 'none',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M14 8A6 6 0 112 8" /><path d="M14 4v4h-4" />
            </svg>
          </button>
          {/* Stash */}
          <button
            onClick={stash}
            disabled={opLoading || files.length === 0}
            title="Stash changes"
            style={{
              width: 28, height: 28, borderRadius: 5, border: '1px solid var(--caval-border)',
              background: 'var(--caval-surface)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--caval-text-muted)', opacity: files.length === 0 ? 0.4 : 1,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1L1 5v2l7 4 7-4V5L8 1zm0 2.2L13 6l-5 2.8L3 6l5-2.8zM1 9v2l7 4 7-4V9l-7 4-7-4z"/>
            </svg>
          </button>
          <button
            onClick={stashPop}
            disabled={opLoading}
            title="Stash pop"
            style={{
              width: 28, height: 28, borderRadius: 5, border: '1px solid var(--caval-border)',
              background: 'var(--caval-surface)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--caval-text-muted)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 14L1 10V8l7 4 7-4v2L8 14z" />
              <path d="M8 10L1 6V4l7 4 7-4v2L8 10z" />
              <path d="M8 6L1 2v2l7 4 7-4V2L8 6z" />
            </svg>
          </button>
        </div>
      </div>

      {runningFeedback && (
        <div
          data-testid="git-operation"
          role="status"
          style={{
            margin: '6px 10px 0', padding: '6px 10px', borderRadius: 6, fontSize: 11.5,
            background: 'rgba(0,224,255,0.08)',
            border: '1px solid rgba(0,224,255,0.18)',
            color: 'var(--caval-accent)',
            flexShrink: 0,
          }}
        >
          {runningFeedback}
        </div>
      )}

      {opResult && (
        <div
          data-testid="git-op-result"
          style={{
          margin: '6px 10px 0', padding: '6px 10px', borderRadius: 6, fontSize: 11.5,
          background: opResult.ok ? 'rgba(47,191,113,0.1)' : 'rgba(244,112,103,0.1)',
          border: `1px solid ${opResult.ok ? 'rgba(47,191,113,0.2)' : 'rgba(244,112,103,0.2)'}`,
          color: opResult.ok ? '#2FBF71' : '#F47067',
          flexShrink: 0,
        }}>
          {opResult.message}
        </div>
      )}

      {error && (
        <div
          data-testid="git-error"
          role="alert"
          style={{
          margin: '6px 10px 0', padding: '6px 10px', borderRadius: 6, fontSize: 11.5,
          background: 'rgba(244,112,103,0.08)', border: '1px solid rgba(244,112,103,0.15)',
          color: '#F47067', flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      {/* ── Tabs ────────────────────────────── */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--caval-border)',
        flexShrink: 0, marginTop: 4,
      }}>
        {(['changes', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '6px 0', border: 'none', background: 'transparent',
              cursor: 'pointer', fontSize: 11.5, fontWeight: 500,
              color: activeTab === tab ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
              borderBottom: activeTab === tab ? '2px solid var(--caval-accent)' : '2px solid transparent',
              transition: 'all 0.12s',
            }}
          >
            {tab === 'changes' ? `Changes ${files.length > 0 ? `(${files.length})` : ''}` : 'History'}
          </button>
        ))}
      </div>

      {/* ── Tab: Changes ────────────────────── */}
      {activeTab === 'changes' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="ai-messages-scroll">
            {files.length === 0 && !loading ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--caval-text-muted)', fontSize: 12 }}>
                Nicio modificare. Working tree curat.
              </div>
            ) : (
              <>
                {/* Staged */}
                {stagedFiles.length > 0 && (
                  <>
                    <SectionHeader
                      label="Staged"
                      count={stagedFiles.length}
                      staged
                      onUnstageAll={unstageAll}
                    />
                    {stagedFiles.map((f) => (
                      <FileRow
                        key={f.path + '-staged'}
                        file={f}
                        isSelected={selectedFile?.path === f.path && selectedFile.staged === f.staged}
                        onSelect={() => handleFileClick(f)}
                        onStage={() => void stage(f.path)}
                        onUnstage={() => void unstage(f.path)}
                        onDiscard={() => void discard(f.path)}
                        busy={busyOp === 'unstage' || busyOp === 'stage'}
                      />
                    ))}
                  </>
                )}

                {/* Unstaged / Untracked */}
                {unstagedFiles.length > 0 && (
                  <>
                    <SectionHeader
                      label="Changes"
                      count={unstagedFiles.length}
                      staged={false}
                      onStageAll={stageAll}
                    />
                    {unstagedFiles.map((f) => (
                      <FileRow
                        key={f.path + '-unstaged'}
                        file={f}
                        isSelected={selectedFile?.path === f.path && selectedFile.staged === f.staged}
                        onSelect={() => handleFileClick(f)}
                        onStage={() => void stage(f.path)}
                        onUnstage={() => void unstage(f.path)}
                        onDiscard={() => void discard(f.path)}
                        busy={busyOp === 'stage' || busyOp === 'unstage'}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          <GitDiffPanel />

          {/* ── Commit box ──────────────────── */}
          <div style={{
            flexShrink: 0, padding: '8px 10px',
            borderTop: '1px solid var(--caval-border)',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <textarea
              data-testid="git-commit-message"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  if (canCommit) void commit();
                }
              }}
              placeholder="Mesaj commit… (Ctrl+Enter pentru commit)"
              rows={2}
              style={{
                background: 'var(--caval-surface)', border: '1px solid var(--caval-border)',
                borderRadius: 6, padding: '6px 8px',
                color: 'var(--caval-text)', fontSize: 12,
                fontFamily: "'Inter', sans-serif", resize: 'none', outline: 'none',
                lineHeight: 1.5,
              }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--caval-accent-ring)'; }}
              onBlur={(e)  => { e.target.style.borderColor = 'var(--caval-border)'; }}
            />
            <button
              data-testid="git-commit"
              onClick={() => void commit()}
              disabled={!canCommit}
              style={{
                padding: '6px 0', borderRadius: 6, border: 'none',
                background: canCommit
                  ? 'var(--caval-accent)' : 'rgba(255,255,255,0.07)',
                color: canCommit
                  ? '#0E0E0F' : 'var(--caval-text-muted)',
                fontWeight: 600, fontSize: 12.5, cursor: canCommit ? 'pointer' : 'not-allowed',
                opacity: busyOp === 'commit' ? 0.6 : 1,
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {busyOp === 'commit' ? (
                <span style={{ animation: 'caval-blink 0.8s infinite' }}>Committing…</span>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="8" cy="8" r="3" /><path d="M8 1v4M8 11v4M1 8h4M11 8h4" />
                  </svg>
                  Commit {stagedFiles.length > 0 ? `(${stagedFiles.length})` : ''}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: History ────────────────────── */}
      {activeTab === 'history' && (
        <div style={{ flex: 1, overflowY: 'auto' }} className="ai-messages-scroll">
          {commits.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--caval-text-muted)', fontSize: 12 }}>
              Niciun commit în istoric.
            </div>
          ) : (
            commits.map((c) => <CommitRow key={c.hash} commit={c} />)
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
//  Sub-componente helper
// ──────────────────────────────────────────────

function ActionBtn({
  title, onClick, disabled, children, icon, accent,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, height: 28, borderRadius: 5, border: '1px solid var(--caval-border)',
        background: accent ? 'rgba(0,224,255,0.08)' : 'var(--caval-surface)',
        color: accent ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 11.5, fontWeight: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = accent ? 'rgba(0,224,255,0.14)' : 'var(--caval-surface-raised)';
          e.currentTarget.style.color = accent ? 'var(--caval-accent)' : 'var(--caval-text)';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = accent ? 'rgba(0,224,255,0.08)' : 'var(--caval-surface)';
          e.currentTarget.style.color = accent ? 'var(--caval-accent)' : 'var(--caval-text-muted)';
        }
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function GitIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="var(--caval-text-muted)" strokeWidth="1.4">
      <circle cx="5" cy="3" r="1.5" /><circle cx="5" cy="13" r="1.5" /><circle cx="11" cy="8" r="1.5" />
      <path d="M5 4.5v7M5 4.5C5 6.5 11 6.5 11 8" />
    </svg>
  );
}

function EmptyState({
  icon, title, desc, action, alert,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  action?: { label: string; onClick: () => void };
  alert?: string | null;
}) {
  return (
    <div
      data-testid="git-empty"
      style={{
      flex: 1, height: '100%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 10, padding: 24, textAlign: 'center',
    }}>
      <div style={{ opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--caval-text)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--caval-text-muted)', lineHeight: 1.5 }}>{desc}</div>
      {alert && (
        <div data-testid="git-error" role="alert" style={{ fontSize: 12, color: '#F47067' }}>
          {alert}
        </div>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 4, padding: '6px 14px', borderRadius: 6,
            background: 'rgba(0,224,255,0.08)', border: '1px solid rgba(0,224,255,0.2)',
            color: 'var(--caval-accent)', fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, cursor: 'pointer',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

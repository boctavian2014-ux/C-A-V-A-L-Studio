import React, { useEffect, useMemo, useState } from 'react';
import { DiffEditor, useMonaco } from '@monaco-editor/react';
import type * as MonacoType from 'monaco-editor';
import { useGitStore } from '../../store/git-store';
import { parseUnifiedDiff } from '../../../../ai/review/diff-parser';
import type { ReviewHunk } from '../../../../ai/review/types';
import { GitHunkView } from './GitHunkView';
import { useEditorStore } from '../../store/editor-store';

const CAVAL_DARK_THEME: MonacoType.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '5C6370', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'C678DD' },
    { token: 'string', foreground: '98C379' },
  ],
  colors: {
    'editor.background': '#0D1117',
    'editor.foreground': '#F5F7FA',
    'diffEditor.insertedTextBackground': '#2FBF7118',
    'diffEditor.removedTextBackground': '#F4706718',
  },
};

type DiffTab = 'side-by-side' | 'inline';

function statusColor(s: string): string {
  switch (s) {
    case 'M': return '#E2C08D';
    case 'A': return '#2FBF71';
    case 'D': return '#F47067';
    default: return '#909090';
  }
}

export function GitDiffWorkbench() {
  const monaco = useMonaco();
  const [tab, setTab] = useState<DiffTab>('side-by-side');
  const [hunkStates, setHunkStates] = useState<Record<string, ReviewHunk['decision']>>({});
  const projectPath = useEditorStore((s) => s.projectPath);

  const {
    selectedFile,
    filePair,
    diffContent,
    diffLoading,
    filePairLoading,
    stage,
    discard,
    revertHunk,
  } = useGitStore();

  useEffect(() => {
    if (!monaco) return;
    monaco.editor.defineTheme('caval-dark', CAVAL_DARK_THEME);
    monaco.editor.setTheme('caval-dark');
  }, [monaco]);

  useEffect(() => {
    setHunkStates({});
  }, [selectedFile?.path, selectedFile?.staged, diffContent]);

  const hunks = useMemo(() => {
    if (!diffContent.trim()) return [];
    return parseUnifiedDiff(diffContent).map((h) => ({
      ...h,
      decision: hunkStates[h.id] ?? h.decision,
    }));
  }, [diffContent, hunkStates]);

  if (!selectedFile) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0D1117', color: 'var(--caval-text-muted)', fontSize: 13 }}>
        Selectează un fișier din panoul Git pentru a vedea diff-ul complet.
      </div>
    );
  }

  const handleKeep = (hunk: ReviewHunk) => {
    setHunkStates((prev) => ({ ...prev, [hunk.id]: 'accepted' }));
  };

  const handleCancel = (hunk: ReviewHunk) => {
    setHunkStates((prev) => ({ ...prev, [hunk.id]: 'pending' }));
  };

  const handleRevert = async (hunk: ReviewHunk, hunkPatch: string) => {
    if (!projectPath || selectedFile.staged) return;
    const ok = await revertHunk(hunkPatch);
    if (ok) setHunkStates((prev) => ({ ...prev, [hunk.id]: 'rejected' }));
  };

  const loading = diffLoading || filePairLoading;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0D1117', minWidth: 0 }}>
      <header style={{
        padding: '8px 14px',
        borderBottom: '1px solid var(--caval-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ color: statusColor(selectedFile.status), fontWeight: 700, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
          {selectedFile.status}
        </span>
        <span style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedFile.path}
        </span>
        <span style={{ fontSize: 10, color: 'var(--caval-text-muted)' }}>
          {selectedFile.staged ? 'staged' : 'working tree'}
        </span>
        {!selectedFile.staged && selectedFile.status !== '?' && (
          <button type="button" onClick={() => void stage(selectedFile.path)} style={headerBtnStyle}>Stage</button>
        )}
        {!selectedFile.staged && (
          <button type="button" onClick={() => void discard(selectedFile.path)} style={{ ...headerBtnStyle, color: '#F47067' }}>Discard file</button>
        )}
        <div style={{ display: 'flex', border: '1px solid var(--caval-border)', borderRadius: 6, overflow: 'hidden' }}>
          {(['side-by-side', 'inline'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: '4px 10px',
                border: 'none',
                fontSize: 11,
                cursor: 'pointer',
                background: tab === t ? 'rgba(0,224,255,0.12)' : 'transparent',
                color: tab === t ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
              }}
            >
              {t === 'side-by-side' ? 'Side-by-side' : 'Inline'}
            </button>
          ))}
        </div>
      </header>

      {loading && (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--caval-text-muted)' }}>Se încarcă diff…</div>
      )}

      {!loading && tab === 'side-by-side' && filePair && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <DiffEditor
            height="100%"
            language={filePair.language}
            original={filePair.original}
            modified={filePair.modified}
            theme="caval-dark"
            options={{
              readOnly: true,
              renderSideBySide: true,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              scrollBeyondLastLine: false,
              minimap: { enabled: false },
            }}
          />
        </div>
      )}

      {!loading && tab === 'inline' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }} className="ai-messages-scroll">
          {hunks.length === 0 ? (
            <p style={{ color: 'var(--caval-text-muted)', fontSize: 12 }}>Nicio diferență de afișat.</p>
          ) : (
            hunks.map((hunk) => (
              <GitHunkView
                key={hunk.id}
                hunk={hunk}
                disabled={selectedFile.staged || selectedFile.status === 'D'}
                onKeep={handleKeep}
                onRevert={(h, patch) => void handleRevert(h, patch)}
                onCancel={handleCancel}
              />
            ))
          )}
        </div>
      )}

      {!loading && tab === 'side-by-side' && !filePair && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--caval-text-muted)', fontSize: 12 }}>
          Nu s-a putut încărca perechea de fișiere.
        </div>
      )}
    </div>
  );
}

const headerBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 5,
  border: '1px solid var(--caval-border)',
  background: 'transparent',
  color: 'var(--caval-text-muted)',
  fontSize: 11,
  cursor: 'pointer',
};

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { CavaloHorseMark } from '../brand/CavaloHorseMark';
import { GitHubMark } from '../brand/GitHubMark';
import { useOpenWorkspace } from '../../hooks/useOpenWorkspace';
import { useCavalTheme } from '../../../../themes/theme-provider';
import {
  handleWelcomeCloneKeyDown,
  toggleWelcomeRecentList,
  WELCOME_NO_RECENT_PROJECTS,
  WELCOME_RECENT_PROJECTS_LABEL,
} from './welcome-workspace-utils';

interface RecentEntry {
  path: string;
  name: string;
  lastOpened: string;
  source: 'folder' | 'clone';
}

export function WelcomeWorkspacePanel() {
  const { theme } = useCavalTheme();
  const { openWorkspace } = useOpenWorkspace();
  const [repoUrl, setRepoUrl] = useState('');
  const [showCloneInput, setShowCloneInput] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [showRecentList, setShowRecentList] = useState(false);
  const cloneInputRef = useRef<HTMLInputElement>(null);

  const loadRecent = useCallback(async () => {
    const res = await window.caval.workspace?.listRecent?.();
    if (res?.ok && res.entries) setRecent(res.entries);
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    if (showCloneInput) {
      cloneInputRef.current?.focus();
    }
  }, [showCloneInput]);

  const revealCloneInput = useCallback(() => {
    setShowCloneInput(true);
    setError(null);
  }, []);

  const handleClone = useCallback(async () => {
    const url = repoUrl.trim();
    if (!url) {
      setError('Introdu un URL GitHub');
      return;
    }
    setCloning(true);
    setError(null);
    try {
      const result = await window.caval.git.clone({ url });
      if (!result.ok || !result.path) {
        setError(result.error ?? 'Clone eșuat');
        return;
      }
      await openWorkspace(result.path, 'clone');
      await loadRecent();
      setRepoUrl('');
      setShowCloneInput(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCloning(false);
    }
  }, [loadRecent, openWorkspace, repoUrl]);

  const handleRemoveRecent = useCallback(
    async (entryPath: string) => {
      await window.caval.workspace?.removeRecent?.(entryPath);
      await loadRecent();
    },
    [loadRecent]
  );

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0D1117',
        flexDirection: 'column',
        gap: 16,
        color: theme.colors.textMuted,
        userSelect: 'none',
        padding: 24,
      }}
    >
      <CavaloHorseMark size={88} />

      <div style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.6, maxWidth: 520 }}>
        <button
          type="button"
          aria-label="Clonează de pe GitHub"
          disabled={cloning}
          onClick={revealCloneInput}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            background: 'transparent',
            border: 'none',
            cursor: cloning ? 'wait' : 'pointer',
            padding: 8,
            borderRadius: 12,
            color: theme.colors.textMuted,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#00E0FF';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = theme.colors.textMuted;
          }}
        >
          <GitHubMark size={36} />
        </button>

        {showCloneInput && (
          <input
            ref={cloneInputRef}
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onKeyDown={(e) => {
              handleWelcomeCloneKeyDown(e.key, {
                onEnter: () => void handleClone(),
                onEscape: () => {
                  setShowCloneInput(false);
                  setRepoUrl('');
                  setError(null);
                },
              });
            }}
            onBlur={() => {
              if (!repoUrl.trim() && !cloning) {
                setShowCloneInput(false);
              }
            }}
            placeholder="https://github.com/owner/repo"
            disabled={cloning}
            style={{
              width: '100%',
              maxWidth: 340,
              margin: '0 auto 8px',
              display: 'block',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(0,224,255,0.25)',
              background: 'rgba(255,255,255,0.04)',
              color: '#F5F7FA',
              fontSize: 13,
              outline: 'none',
            }}
          />
        )}

        {error && (
          <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{error}</div>
        )}

        {cloning && (
          <div style={{ fontSize: 12, color: '#00E0FF', marginBottom: 8 }}>
            Se clonează repository-ul…
          </div>
        )}

        <div style={{ marginTop: 12, textAlign: 'left', width: '100%', maxWidth: 420 }}>
          <button
            type="button"
            aria-expanded={showRecentList}
            onClick={() => setShowRecentList((current) => toggleWelcomeRecentList(current))}
            style={{
              display: 'block',
              width: '100%',
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(245,247,250,0.55)',
              marginBottom: 8,
              textAlign: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            {WELCOME_RECENT_PROJECTS_LABEL}
          </button>
          {showRecentList && recent.length === 0 && (
            <p style={{ fontSize: 12, textAlign: 'center', color: theme.colors.textMuted, margin: '0 0 8px' }}>
              {WELCOME_NO_RECENT_PROJECTS}
            </p>
          )}
          {showRecentList && recent.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recent.map((entry) => (
                <div
                  key={entry.path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void openWorkspace(entry.path, entry.source)}
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      color: '#F5F7FA',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{entry.name}</div>
                    <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>
                      {entry.path}
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label="Elimină din recente"
                    onClick={() => void handleRemoveRecent(entry.path)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.colors.textMuted,
                      cursor: 'pointer',
                      fontSize: 16,
                      lineHeight: 1,
                      padding: '0 4px',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

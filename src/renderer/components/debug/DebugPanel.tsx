import React, { useCallback, useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editor-store';

interface DebugSession {
  id: string;
  pid: number;
  program: string;
}

export function DebugPanel() {
  const { projectPath } = useEditorStore();
  const [sessions, setSessions] = useState<DebugSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [launchConfig, setLaunchConfig] = useState<{ program: string; args?: string[] } | null>(null);

  const refresh = useCallback(async () => {
    const caval = window.caval as {
      debug?: {
        list?: () => Promise<{ ok: boolean; sessions?: DebugSession[] }>;
        launchConfig?: () => Promise<{ ok: boolean; config?: { program: string; args?: string[] } }>;
      };
    };
    const listRes = await caval?.debug?.list?.();
    if (listRes?.sessions) setSessions(listRes.sessions);
    const cfgRes = await caval?.debug?.launchConfig?.();
    if (cfgRes?.config) setLaunchConfig(cfgRes.config);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, projectPath]);

  const launch = async () => {
    setError(null);
    const res = await (window.caval as { debug?: { launch?: () => Promise<{ ok: boolean; error?: string }> } })?.debug?.launch?.();
    if (!res?.ok) setError(res?.error ?? 'Launch failed');
    void refresh();
  };

  const stop = async (id: string) => {
    await (window.caval as { debug?: { stop?: (id: string) => Promise<unknown> } })?.debug?.stop?.(id);
    void refresh();
  };

  return (
    <div style={{ padding: 10, fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, flex: 1 }}>DEBUG</span>
        <button
          type="button"
          onClick={() => void launch()}
          disabled={!projectPath}
          style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--caval-border)', background: 'none', cursor: 'pointer', color: 'var(--caval-text)' }}
        >
          F5 Launch
        </button>
      </div>
      {!projectPath && (
        <p style={{ margin: 0, color: 'var(--caval-text-muted)', fontSize: 11 }}>Deschide un folder pentru debug Node.js</p>
      )}
      {launchConfig && (
        <p style={{ margin: '0 0 6px', color: 'var(--caval-text-muted)', fontSize: 10, fontFamily: 'monospace' }}>
          launch.json: {launchConfig.program}
        </p>
      )}
      {error && <p style={{ margin: '0 0 6px', color: '#EF4444', fontSize: 11 }}>{error}</p>}
      {sessions.map((s) => (
        <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
          <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 10 }}>pid {s.pid}</span>
          <button type="button" onClick={() => void stop(s.id)} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--caval-border)', background: 'none', cursor: 'pointer' }}>
            Stop
          </button>
        </div>
      ))}
    </div>
  );
}

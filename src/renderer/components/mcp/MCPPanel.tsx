import React, { useEffect, useState, useCallback } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { mcpStartErrorHint } from '../../../../ai/mcp/mcp-env';

interface McpToolInfo {
  serverId: string;
  name: string;
  description: string;
}

interface McpServerStatus {
  id: string;
  name: string;
  running: boolean;
  tools: string[];
  toolDetails?: McpToolInfo[];
  error?: string;
}

export function MCPPanel() {
  const projectPath = useEditorStore((s) => s.projectPath);
  const [servers, setServers] = useState<McpServerStatus[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [autoChecked, setAutoChecked] = useState(false);

  const refresh = useCallback(async () => {
    const caval = (window as unknown as {
      caval?: {
        mcpList?: () => Promise<{ servers?: McpServerStatus[] }>;
        mcpEnsureReady?: () => Promise<{ ok?: boolean; servers?: McpServerStatus[] }>;
      };
    }).caval;
    const res = await caval?.mcpList?.();
    if (res?.servers) setServers(res.servers);
  }, []);

  const restart = async (id: string) => {
    const caval = (window as unknown as {
      caval?: {
        mcpStop?: (id: string) => Promise<unknown>;
        mcpStart?: (id: string) => Promise<{ ok?: boolean; status?: McpServerStatus }>;
        mcpEnsureReady?: () => Promise<unknown>;
      };
    }).caval;
    setLoading(id);
    await caval?.mcpStop?.(id);
    await caval?.mcpStart?.(id);
    setLoading(null);
    void refresh();
  };

  const ensureAll = async () => {
    const caval = (window as unknown as {
      caval?: { mcpEnsureReady?: () => Promise<{ servers?: McpServerStatus[] }> };
    }).caval;
    setLoading('all');
    const res = await caval?.mcpEnsureReady?.();
    if (res?.servers) setServers(res.servers);
    setLoading(null);
  };

  useEffect(() => {
    void refresh();
  }, [refresh, projectPath]);

  useEffect(() => {
    if (!projectPath?.trim() || autoChecked) return;
    setAutoChecked(true);
    void ensureAll();
  }, [projectPath, autoChecked]);

  const toggle = async (id: string, running: boolean) => {
    const caval = (window as unknown as {
      caval?: {
        mcpStart?: (id: string) => Promise<{ ok?: boolean; status?: McpServerStatus }>;
        mcpStop?: (id: string) => Promise<unknown>;
      };
    }).caval;
    setLoading(id);
    if (running) await caval?.mcpStop?.(id);
    else await caval?.mcpStart?.(id);
    setLoading(null);
    void refresh();
  };

  const needsFolder = !projectPath?.trim();

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>MCP Servers</div>
        <button
          type="button"
          onClick={() => void ensureAll()}
          disabled={loading === 'all' || needsFolder}
          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--caval-border)', background: 'none', cursor: needsFolder ? 'not-allowed' : 'pointer', color: 'var(--caval-text-muted)' }}
        >
          {loading === 'all' ? '…' : 'Health'}
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--caval-border)', background: 'none', cursor: 'pointer', color: 'var(--caval-text-muted)' }}
        >
          ↻
        </button>
      </div>

      {needsFolder && (
        <div style={{
          marginBottom: 10,
          padding: '8px 10px',
          borderRadius: 6,
          border: '1px solid var(--caval-border)',
          background: 'var(--caval-bg-subtle, rgba(255,255,255,0.03))',
          fontSize: 11,
          lineHeight: 1.45,
          color: 'var(--caval-text-muted)',
        }}>
          Deschide un folder de proiect pentru a porni serverele MCP (filesystem, git).
          Lista de mai jos vine din <code style={{ fontSize: 10 }}>caval.jsonc</code>.
        </div>
      )}

      <p style={{ fontSize: 10.5, color: 'var(--caval-text-muted)', marginBottom: 10, lineHeight: 1.45 }}>
        Configurează în <code style={{ fontSize: 10 }}>caval.jsonc</code>. Chat pornește automat serverele enabled.
      </p>

      {servers.length === 0 && (
        <p style={{ fontSize: 11, color: 'var(--caval-text-muted)' }}>
          Adaugă servere în caval.jsonc → mcp.servers
        </p>
      )}

      {servers.map((s) => {
        const hint = s.error ? mcpStartErrorHint(s.id, s.error) : undefined;
        return (
          <div key={s.id} style={{
            padding: '8px 0',
            borderBottom: '1px solid var(--caval-border)',
            fontSize: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontWeight: 600 }}>{s.name}</span>
              <span style={{
                fontSize: 10,
                color: s.running ? 'var(--caval-success)' : s.error ? '#EF4444' : 'var(--caval-text-muted)',
              }}>
                {s.running ? `● ${s.tools.length} tools` : s.error ? '● error' : '○ off'}
              </span>
              {s.running && (
                <button
                  type="button"
                  disabled={loading === s.id}
                  onClick={() => void restart(s.id)}
                  style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--caval-border)', background: 'none', cursor: 'pointer', color: 'var(--caval-text-muted)' }}
                >
                  ↻
                </button>
              )}
              <button
                type="button"
                disabled={loading === s.id || needsFolder}
                onClick={() => void toggle(s.id, s.running)}
                style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--caval-border)', background: 'none', cursor: needsFolder ? 'not-allowed' : 'pointer', color: 'var(--caval-text)' }}
              >
                {loading === s.id ? '…' : s.running ? 'Stop' : 'Start'}
              </button>
            </div>

            {s.error && (
              <div style={{ marginTop: 4, fontSize: 10, color: '#EF4444', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                {s.error.slice(0, 600)}
                {hint && (
                  <div style={{ marginTop: 4, color: 'var(--caval-text-muted)' }}>
                    {hint}
                  </div>
                )}
              </div>
            )}

            {s.running && (s.toolDetails?.length ?? 0) > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {s.toolDetails!.slice(0, 8).map((tool) => (
                  <div key={tool.name} style={{ fontSize: 10, color: 'var(--caval-text-muted)' }}>
                    · {tool.name}
                  </div>
                ))}
                {(s.toolDetails?.length ?? 0) > 8 && (
                  <div style={{ fontSize: 10, color: 'var(--caval-text-muted)' }}>
                    +{(s.toolDetails?.length ?? 0) - 8} tools
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

import React, { useEffect, useState, useCallback } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { mcpStartErrorHint } from '../../../../ai/mcp/mcp-env';
import { useTranslation } from '../../../../ai/i18n/useTranslation';

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
  trustStatus?: 'local_safe' | 'allowed' | 'denied' | 'pending';
  capabilities?: string[];
  safety?: 'LOCAL_SAFE' | 'NETWORK_OR_WRITE';
}

export function MCPPanel() {
  const { t } = useTranslation();
  const projectPath = useEditorStore((s) => s.projectPath);
  const [servers, setServers] = useState<McpServerStatus[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const caval = (window as unknown as {
      caval?: {
        mcpList?: () => Promise<{ servers?: McpServerStatus[] }>;
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
      };
    }).caval;
    setLoading(id);
    await caval?.mcpStop?.(id);
    await caval?.mcpStart?.(id);
    setLoading(null);
    void refresh();
  };

  /** Explicit health for already-trusted / LOCAL_SAFE servers only — no silent first-run trust. */
  const ensureTrusted = async () => {
    const caval = (window as unknown as {
      caval?: { mcpEnsureReady?: () => Promise<{ servers?: McpServerStatus[] }> };
    }).caval;
    setLoading('all');
    const res = await caval?.mcpEnsureReady?.();
    if (res?.servers) setServers(res.servers);
    else await refresh();
    setLoading(null);
  };

  useEffect(() => {
    void refresh();
  }, [refresh, projectPath]);

  const toggle = async (id: string, running: boolean) => {
    const caval = (window as unknown as {
      caval?: {
        mcpStart?: (id: string) => Promise<{ ok?: boolean; status?: McpServerStatus; error?: string }>;
        mcpStop?: (id: string) => Promise<unknown>;
      };
    }).caval;
    setLoading(id);
    if (running) await caval?.mcpStop?.(id);
    else await caval?.mcpStart?.(id);
    setLoading(null);
    void refresh();
  };

  const revokeTrust = async (serverId: string) => {
    const caval = (window as unknown as {
      caval?: {
        mcpTrustRevoke?: (input?: { serverId?: string }) => Promise<unknown>;
        mcpStop?: (id: string) => Promise<unknown>;
      };
    }).caval;
    setLoading(serverId);
    await caval?.mcpStop?.(serverId);
    await caval?.mcpTrustRevoke?.({ serverId });
    setLoading(null);
    void refresh();
  };

  const needsFolder = !projectPath?.trim();

  const trustLabel = (s: McpServerStatus): string => {
    switch (s.trustStatus) {
      case 'local_safe':
        return 'local-safe';
      case 'allowed':
        return 'trusted';
      case 'denied':
        return 'denied';
      default:
        return 'pending trust';
    }
  };

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>MCP Servers</div>
        <button
          type="button"
          onClick={() => void ensureTrusted()}
          disabled={loading === 'all' || needsFolder}
          title={t('mcp.startTrustedTitle')}
          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--caval-border)', background: 'none', cursor: needsFolder ? 'not-allowed' : 'pointer', color: 'var(--caval-text-muted)' }}
        >
          {loading === 'all' ? '…' : 'Start trusted'}
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
          Deschide un folder de proiect pentru MCP. Serverele cu network/write necesită trust explicit (ca Workspace Trust).
        </div>
      )}

      <p style={{ fontSize: 10.5, color: 'var(--caval-text-muted)', marginBottom: 10, lineHeight: 1.45 }}>
        {t('mcp.configureIn')} <code style={{ fontSize: 10 }}>caval.jsonc</code>. Network/write servers start only after you Allow once per workspace.
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
              <span style={{ fontSize: 10, color: 'var(--caval-text-muted)' }}>
                {trustLabel(s)}
              </span>
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
              {(s.trustStatus === 'allowed' || s.trustStatus === 'denied') && (
                <button
                  type="button"
                  disabled={loading === s.id || needsFolder}
                  onClick={() => void revokeTrust(s.id)}
                  style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--caval-border)', background: 'none', cursor: needsFolder ? 'not-allowed' : 'pointer', color: 'var(--caval-text-muted)' }}
                >
                  Revoke
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

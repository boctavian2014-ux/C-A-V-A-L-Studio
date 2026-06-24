import React, { useEffect, useState } from 'react';

interface McpServerStatus {
  id: string;
  name: string;
  running: boolean;
  tools: string[];
  error?: string;
}

export function MCPPanel() {
  const [servers, setServers] = useState<McpServerStatus[]>([]);

  const refresh = async () => {
    const caval = (window as unknown as {
      caval?: { mcpList?: () => Promise<{ servers?: McpServerStatus[] }> };
    }).caval;
    const res = await caval?.mcpList?.();
    if (res?.servers) setServers(res.servers);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const toggle = async (id: string, running: boolean) => {
    const caval = (window as unknown as {
      caval?: {
        mcpStart?: (id: string) => Promise<unknown>;
        mcpStop?: (id: string) => Promise<unknown>;
      };
    }).caval;
    if (running) await caval?.mcpStop?.(id);
    else await caval?.mcpStart?.(id);
    void refresh();
  };

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>MCP Servers</div>
      {servers.length === 0 && (
        <p style={{ fontSize: 11, color: 'var(--caval-text-muted)' }}>
          Adaugă servere în caval.jsonc → mcp.servers
        </p>
      )}
      {servers.map((s) => (
        <div key={s.id} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
          borderBottom: '1px solid var(--caval-border)', fontSize: 12,
        }}>
          <span style={{ flex: 1 }}>{s.name}</span>
          <span style={{ fontSize: 10, color: s.running ? 'var(--caval-success)' : 'var(--caval-text-muted)' }}>
            {s.running ? 'on' : 'off'}
          </span>
          <button
            type="button"
            onClick={() => void toggle(s.id, s.running)}
            style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--caval-border)', background: 'none', cursor: 'pointer', color: 'var(--caval-text)' }}
          >
            {s.running ? 'Stop' : 'Start'}
          </button>
        </div>
      ))}
    </div>
  );
}

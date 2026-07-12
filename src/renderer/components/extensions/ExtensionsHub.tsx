import React, { useCallback, useMemo, useState } from 'react';
import { MCPPanel } from '../mcp/MCPPanel';
import { MarketplacePanel } from '../../../../marketplace/client/ui/marketplace-panel';
import { useEditorStore } from '../../store/editor-store';
import type { MarketplaceExtension } from '../../../../marketplace/api';

type ExtensionsTab = 'marketplace' | 'mcp';

const FEATURED: never[] = [];

const DEFAULT_MARKETPLACE_PORT = 8787;

function resolveMarketplaceBaseUrl(): string {
  const fromEnv = typeof process !== 'undefined' ? process.env.CAVAL_MARKETPLACE_URL : undefined;
  if (fromEnv?.trim()) return fromEnv.trim().replace(/\/$/, '');
  const port = typeof process !== 'undefined'
    ? (process.env.CAVAL_MARKETPLACE_PORT ?? String(DEFAULT_MARKETPLACE_PORT))
    : String(DEFAULT_MARKETPLACE_PORT);
  return `http://127.0.0.1:${port}`;
}

export function ExtensionsHub() {
  const [tab, setTab] = useState<ExtensionsTab>('marketplace');
  const projectPath = useEditorStore((s) => s.projectPath);
  const baseUrl = useMemo(() => resolveMarketplaceBaseUrl(), []);

  const installExtension = useCallback(async (extension: MarketplaceExtension) => {
    const caval = window.caval as {
      extensions?: {
        install?: (input: { extensionId: string; baseUrl: string }) => Promise<{ ok: boolean; error?: string }>;
      };
    };
    if (!caval?.extensions?.install) {
      return { ok: false, error: 'IPC extensions:install indisponibil' };
    }
    if (!projectPath) {
      return { ok: false, error: 'Deschide un folder de proiect înainte de instalare.' };
    }
    return caval.extensions.install({ extensionId: extension.id, baseUrl });
  }, [baseUrl, projectPath]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--caval-border)', flexShrink: 0 }}>
        {(['marketplace', 'mcp'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            style={{
              flex: 1,
              padding: '8px 10px',
              fontSize: 11,
              fontWeight: 600,
              border: 'none',
              borderBottom: tab === id ? '2px solid var(--caval-accent)' : '2px solid transparent',
              background: 'transparent',
              color: tab === id ? 'var(--caval-text)' : 'var(--caval-text-muted)',
              cursor: 'pointer',
            }}
          >
            {id === 'marketplace' ? 'Extensions' : 'MCP'}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }} className="ai-messages-scroll">
        {tab === 'mcp' ? (
          <MCPPanel />
        ) : (
          <div style={{ padding: 8 }}>
            <MarketplacePanel
              baseUrl={baseUrl}
              categories={['themes', 'ai', 'tools']}
              featured={FEATURED}
              marketplaceOnlineHint={`Server: ${baseUrl} — rulează npm run marketplace:serve dacă lista e goală.`}
              onInstall={installExtension}
            />
          </div>
        )}
      </div>
    </div>
  );
}

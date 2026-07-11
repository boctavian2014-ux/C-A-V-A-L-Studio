import React, { useState } from 'react';
import { MCPPanel } from '../mcp/MCPPanel';
import { MarketplacePanel } from '../../../../marketplace/client/ui/marketplace-panel';

type ExtensionsTab = 'marketplace' | 'mcp';

const FEATURED: never[] = [];

export function ExtensionsHub() {
  const [tab, setTab] = useState<ExtensionsTab>('marketplace');

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
              baseUrl=""
              categories={['themes', 'ai', 'tools']}
              featured={FEATURED}
            />
          </div>
        )}
      </div>
    </div>
  );
}

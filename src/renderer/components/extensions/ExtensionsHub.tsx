import React, { useCallback, useEffect, useState } from 'react';
import { MCPPanel } from '../mcp/MCPPanel';
import { VsCodeExtensionsPanel } from '../../../../marketplace/client/ui/vscode-extensions-panel';
import { marketplaceStore } from '../../../../marketplace/client/state/marketplace-store';
import { useEditorStore } from '../../store/editor-store';
import type { MarketplaceExtension } from '../../../../marketplace/api';

type ExtensionsTab = 'marketplace' | 'mcp';

interface InstalledExtension {
  id: string;
  name: string;
  version: string;
}

const MARKETPLACE_STYLES = `
.marketplace-panel { padding: 4px 8px 16px; color: var(--caval-text, #e5e5e5); }
.marketplace-panel .eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--caval-text-muted, #888); margin: 0 0 4px; }
.marketplace-panel h1 { font-size: 16px; margin: 0 0 8px; font-weight: 600; }
.marketplace-panel h2 { font-size: 13px; margin: 16px 0 8px; font-weight: 600; }
.marketplace-hint { font-size: 11px; color: var(--caval-text-muted, #888); margin: 0 0 10px; line-height: 1.4; }
.marketplace-search { display: flex; gap: 6px; margin-bottom: 12px; }
.marketplace-search input {
  flex: 1; font-size: 12px; padding: 6px 10px; border-radius: 6px;
  border: 1px solid var(--caval-border, #333); background: transparent;
  color: var(--caval-text, #e5e5e5);
}
.marketplace-search button {
  font-size: 11px; padding: 6px 12px; border-radius: 6px;
  border: 1px solid var(--caval-border, #333); background: transparent;
  color: var(--caval-text, #e5e5e5); cursor: pointer;
}
.extension-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
.extension-card {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 10px; border-radius: 8px;
  border: 1px solid var(--caval-border, #333);
  background: var(--caval-bg-subtle, rgba(255,255,255,0.02));
  cursor: default;
}
.extension-card__icon {
  width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px;
  background: var(--caval-accent, #3b82f6); color: #fff;
  overflow: hidden;
}
.extension-card__body { flex: 1; min-width: 0; }
.extension-card__body h3 { margin: 0 0 4px; font-size: 13px; font-weight: 600; }
.extension-card__body p { margin: 0 0 6px; font-size: 11px; line-height: 1.4; color: var(--caval-text-muted, #aaa); }
.extension-card__body footer { display: flex; flex-wrap: wrap; gap: 8px; font-size: 10px; color: var(--caval-text-muted, #888); }
.extension-card > button {
  flex-shrink: 0; font-size: 10px; padding: 4px 10px; border-radius: 6px;
  border: 1px solid var(--caval-border, #333); background: transparent;
  color: var(--caval-text, #e5e5e5); cursor: pointer;
}
.extension-card > button:disabled { opacity: 0.55; cursor: default; }
`;

export function ExtensionsHub() {
  const [tab, setTab] = useState<ExtensionsTab>('marketplace');
  const [installed, setInstalled] = useState<InstalledExtension[]>([]);
  const projectPath = useEditorStore((s) => s.projectPath);

  const syncInstalled = useCallback(async () => {
    const res = await window.caval.extensions?.list?.();
    const list = (res?.extensions ?? []) as InstalledExtension[];
    setInstalled(list);
    marketplaceStore.setInstalledIds(list.map((ext) => ext.id));
  }, []);

  useEffect(() => {
    void syncInstalled();
  }, [syncInstalled, projectPath]);

  const installExtension = useCallback(async (extension: MarketplaceExtension) => {
    if (!window.caval.openvsx?.install) {
      return { ok: false, error: 'IPC openvsx:install indisponibil' };
    }
    if (!projectPath) {
      return { ok: false, error: 'Deschide un folder de proiect înainte de instalare.' };
    }
    const res = await window.caval.openvsx.install({
      namespace: extension.publisher,
      name: extension.name,
    });
    if (res.ok) void syncInstalled();
    return res;
  }, [projectPath, syncInstalled]);

  const installedIds = installed.map((ext) => ext.id);

  const isExtensionInstalled = useCallback((extension: MarketplaceExtension) => {
    const base = `${extension.publisher}.${extension.name}`;
    return installed.some((ext) => ext.id === base || ext.id.startsWith(`${base}-`));
  }, [installed]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{MARKETPLACE_STYLES}</style>
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
            {installed.length > 0 && (
              <section style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>Instalate</h2>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {installed.map((ext) => (
                    <li
                      key={ext.id}
                      style={{
                        fontSize: 11,
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--caval-border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span>
                        <strong>{ext.name}</strong>
                        <span style={{ color: 'var(--caval-text-muted)', marginLeft: 6 }}>{ext.id}</span>
                      </span>
                      <span style={{ color: 'var(--caval-text-muted)', fontSize: 10 }}>v{ext.version}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!projectPath && (
              <p style={{ fontSize: 11, color: 'var(--caval-text-muted)', marginBottom: 10 }}>
                Deschide un folder de proiect pentru a instala extensii în <code>.cavalo/extensions</code>.
              </p>
            )}

            <VsCodeExtensionsPanel
              onInstall={installExtension}
              installedIds={installedIds}
              isInstalled={isExtensionInstalled}
            />
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';

const TERMINAL_HEIGHT_KEY = 'caval-terminal-height';

function readStoredTerminalHeight(): number {
  try {
    const raw = localStorage.getItem(TERMINAL_HEIGHT_KEY);
    const n = raw ? Number(raw) : 180;
    if (!Number.isFinite(n)) return 180;
    return Math.max(120, Math.min(480, n));
  } catch {
    return 180;
  }
}

let terminalCounter = 0;

function useTerminal(containerId: string) {
  const termRef = useRef<XTerm | null>(null);
  const fitRef  = useRef<FitAddon | null>(null);
  const idRef   = useRef<string>(`terminal-${++terminalCounter}`);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const id = idRef.current;

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: 'bar',
      theme: {
        background:   '#09090A',
        foreground:   '#F5F7FA',
        cursor:       '#00E0FF',
        cursorAccent: '#0E0E0F',
        black:        '#3B4658',
        red:          '#EF4444',
        green:        '#2FBF71',
        yellow:       '#F59E0B',
        blue:         '#61AFEF',
        magenta:      '#C678DD',
        cyan:         '#00E0FF',
        white:        '#F5F7FA',
        brightBlack:  '#8A95A6',
        brightRed:    '#FF6B6B',
        brightGreen:  '#4ADE80',
        brightYellow: '#FCD34D',
        brightBlue:   '#7DD3FC',
        brightMagenta:'#E879F9',
        brightCyan:   '#7CEBFF',
        brightWhite:  '#FFFFFF',
      },
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon      = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    termRef.current = term;
    fitRef.current  = fitAddon;

    const container = document.getElementById(containerId);
    const onContextMenu = (e: MouseEvent) => {
      const selection = term.getSelection();
      if (!selection) return;
      e.preventDefault();
      void navigator.clipboard.writeText(selection);
    };

    if (container) {
      term.open(container);
      fitAddon.fit();
      container.addEventListener('contextmenu', onContextMenu);
    }

    // Creare sesiune PTY
    const caval = window.caval;
    if (!caval?.terminal) {
      term.writeln('\r\n\x1b[33mTerminal indisponibil — repornește aplicația.\x1b[0m');
      return () => {
        resizeObserver.disconnect();
        if (container) container.removeEventListener('contextmenu', onContextMenu);
        cleanupRef.current?.();
        term.dispose();
      };
    }

    caval.terminal.create(id).then(() => {
      // Trimite input utilizator → PTY
      term.onData((data) => {
        void caval.terminal.write(id, data);
      });

      // Primește output PTY → terminal
      cleanupRef.current = caval.terminal.onData(id, (data: string) => {
        term.write(data);
      });
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims && dims.cols > 0 && dims.rows > 0) {
        void caval.terminal.resize(id, dims.cols, dims.rows);
      }
    });
    if (container) resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (container) container.removeEventListener('contextmenu', onContextMenu);
      cleanupRef.current?.();
      void caval.terminal.destroy(id);
      term.dispose();
    };
  }, [containerId]);

  return { termRef, fitRef };
}

// ──────────────────────────────────────────────
//  Component
// ──────────────────────────────────────────────

type PanelTab = 'terminal' | 'output' | 'problems' | 'debug';

export function TerminalPanel() {
  const [activeTab, setActiveTab] = useState<PanelTab>('terminal');
  const [height, setHeight] = useState(readStoredTerminalHeight);
  const [isVisible, setIsVisible] = useState(true);
  const containerId = 'caval-terminal-container';
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  useTerminal(containerId);

  // ── Resize panel cu drag ───────────────────
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: height };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      setHeight(Math.max(80, Math.min(500, dragRef.current.startH + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [height]);

  useEffect(() => {
    try {
      localStorage.setItem(TERMINAL_HEIGHT_KEY, String(height));
    } catch {
      /* ignore */
    }
  }, [height]);

  const TABS: { id: PanelTab; label: string }[] = [
    { id: 'terminal', label: 'TERMINAL' },
    { id: 'output',   label: 'OUTPUT'   },
    { id: 'problems', label: 'PROBLEME' },
    { id: 'debug',    label: 'DEBUG'    },
  ];

  if (!isVisible) {
    return (
      <div style={{
        height: 28, background: '#09090A',
        borderTop: '1px solid var(--caval-border)',
        display: 'flex', alignItems: 'center', padding: '0 8px',
        gap: 8,
      }}>
        {TABS.map((t) => (
          <span
            key={t.id}
            onClick={() => { setActiveTab(t.id); setIsVisible(true); }}
            style={{
              fontSize: 10.5, color: 'var(--caval-text-muted)',
              cursor: 'pointer', padding: '2px 8px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {t.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div style={{
      height, background: '#09090A',
      borderTop: '1px solid var(--caval-border)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Drag resize handle */}
      <div
        onMouseDown={startResize}
        style={{
          height: 4, cursor: 'row-resize', flexShrink: 0,
          background: 'transparent',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,224,255,0.2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      />

      {/* Tabs header */}
      <div style={{
        display: 'flex', alignItems: 'center', height: 30,
        borderBottom: '1px solid var(--caval-border)',
        padding: '0 4px', flexShrink: 0,
      }}>
        {TABS.map((t) => (
          <span
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '0 12px', height: '100%',
              display: 'flex', alignItems: 'center',
              fontSize: 10.5, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              color: activeTab === t.id ? 'var(--caval-text)' : 'var(--caval-text-muted)',
              borderBottom: activeTab === t.id ? '1.5px solid var(--caval-accent)' : '1.5px solid transparent',
              transition: 'all 0.12s',
            }}
          >
            {t.label}
          </span>
        ))}

        {/* Butoane dreapta */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, padding: '0 8px' }}>
          <PanelBtn title="Terminal nou" onClick={() => {}}>+</PanelBtn>
          <PanelBtn title="Minimizează" onClick={() => setIsVisible(false)}>⌄</PanelBtn>
        </div>
      </div>

      {/* Conținut */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Terminal xterm.js */}
        <div
          id={containerId}
          style={{
            width: '100%', height: '100%',
            padding: '4px 6px',
            display: activeTab === 'terminal' ? 'block' : 'none',
          }}
        />

        {/* Output tab placeholder */}
        {activeTab === 'output' && (
          <div style={{ padding: '8px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: 'var(--caval-text-muted)', lineHeight: 1.7 }}>
            <span style={{ color: 'var(--caval-accent)' }}>▶</span> webpack: compilare finalizată<br />
            <span style={{ color: 'var(--caval-text-muted)' }}>  main/electron-main     12.4 kB</span><br />
            <span style={{ color: 'var(--caval-text-muted)' }}>  renderer/workbench    284.1 kB</span><br />
            <span style={{ color: 'var(--caval-success)' }}>✓ Gata în 1842ms</span>
          </div>
        )}

        {/* Problems tab placeholder */}
        {activeTab === 'problems' && (
          <div style={{ padding: '8px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: 'var(--caval-text-muted)' }}>
            Nu există probleme detectate.
          </div>
        )}

        {/* Debug tab placeholder */}
        {activeTab === 'debug' && (
          <div style={{ padding: '8px 14px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: 'var(--caval-text-muted)' }}>
            Nicio sesiune de debug activă.
          </div>
        )}
      </div>
    </div>
  );
}

function PanelBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 20, height: 20, border: 'none', background: 'none',
        color: 'var(--caval-text-muted)', cursor: 'pointer', borderRadius: 3,
        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(138,149,166,0.12)'; e.currentTarget.style.color = 'var(--caval-text)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--caval-text-muted)'; }}
    >
      {children}
    </button>
  );
}

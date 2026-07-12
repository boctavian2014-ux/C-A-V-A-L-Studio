import React, { useCallback, useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';

const XTERM_THEME = {
  background: '#09090A',
  foreground: '#F5F7FA',
  cursor: '#00E0FF',
  cursorAccent: '#0E0E0F',
  black: '#3B4658',
  red: '#EF4444',
  green: '#2FBF71',
  yellow: '#F59E0B',
  blue: '#61AFEF',
  magenta: '#C678DD',
  cyan: '#00E0FF',
  white: '#F5F7FA',
  brightBlack: '#8A95A6',
  brightRed: '#FF6B6B',
  brightGreen: '#4ADE80',
  brightYellow: '#FCD34D',
  brightBlue: '#7DD3FC',
  brightMagenta: '#E879F9',
  brightCyan: '#7CEBFF',
  brightWhite: '#FFFFFF',
};

export interface TerminalSessionProps {
  sessionId: string;
  containerId: string;
  cwd?: string | null;
  isActive: boolean;
  onReady?: (sessionId: string) => void;
}

export function TerminalSession({
  sessionId,
  containerId,
  cwd,
  isActive,
  onReady,
}: TerminalSessionProps) {
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const sessionReadyRef = useRef(false);
  const pendingWritesRef = useRef<string[]>([]);
  const isActiveRef = useRef(isActive);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const writeToPty = useCallback((raw: string) => {
    const data = raw.endsWith('\r') || raw.endsWith('\n') ? raw : `${raw}\r`;
    const caval = window.caval;
    if (sessionReadyRef.current && caval?.terminal) {
      void caval.terminal.write(sessionId, data);
      return;
    }
    pendingWritesRef.current.push(data);
  }, [sessionId]);

  const fitTerminal = useCallback(() => {
    const fitAddon = fitRef.current;
    const term = termRef.current;
    if (!fitAddon || !term) return;
    fitAddon.fit();
    const dims = fitAddon.proposeDimensions();
    if (dims && dims.cols > 0 && dims.rows > 0) {
      void window.caval?.terminal?.resize(sessionId, dims.cols, dims.rows);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!isActive) return;
    const timer = window.setTimeout(() => fitTerminal(), 0);
    return () => window.clearTimeout(timer);
  }, [isActive, fitTerminal]);

  useEffect(() => {
    const term = new XTerm({
      fontFamily: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: 'bar',
      theme: XTERM_THEME,
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    termRef.current = term;
    fitRef.current = fitAddon;

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

    const createOpts = cwd?.trim() ? { cwd: cwd.trim() } : undefined;
    caval.terminal.create(sessionId, createOpts).then(() => {
      sessionReadyRef.current = true;
      onReady?.(sessionId);
      const queued = pendingWritesRef.current.splice(0);
      for (const data of queued) {
        void caval.terminal.write(sessionId, data);
      }

      term.onData((data) => {
        void caval.terminal.write(sessionId, data);
      });

      cleanupRef.current = caval.terminal.onData(sessionId, (data: string) => {
        term.write(data);
      });
    });

    const resizeObserver = new ResizeObserver(() => {
      if (isActive) fitTerminal();
    });
    if (container) resizeObserver.observe(container);

    const onTerminalWrite = (e: Event) => {
      const detail = (e as CustomEvent<{ data?: string; cmd?: string; sessionId?: string }>).detail;
      if (detail?.sessionId) {
        if (detail.sessionId !== sessionId) return;
      } else if (!isActiveRef.current) {
        return;
      }
      const payload = detail?.data ?? detail?.cmd;
      if (payload) writeToPty(payload);
    };

    document.addEventListener('caval:terminal-write', onTerminalWrite);
    document.addEventListener('caval:run-in-terminal', onTerminalWrite);

    return () => {
      document.removeEventListener('caval:terminal-write', onTerminalWrite);
      document.removeEventListener('caval:run-in-terminal', onTerminalWrite);
      sessionReadyRef.current = false;
      pendingWritesRef.current = [];
      resizeObserver.disconnect();
      if (container) container.removeEventListener('contextmenu', onContextMenu);
      cleanupRef.current?.();
      void caval.terminal.destroy(sessionId);
      term.dispose();
    };
  }, [sessionId, containerId, cwd, writeToPty, onReady, isActive, fitTerminal]);

  return (
    <div
      id={containerId}
      style={{
        width: '100%',
        height: '100%',
        padding: '4px 6px',
        display: isActive ? 'block' : 'none',
        position: 'absolute',
        inset: 0,
      }}
    />
  );
}

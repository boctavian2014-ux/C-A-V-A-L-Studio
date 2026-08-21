import React, { useCallback, useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";

import { MAX_TERMINAL_SCROLLBACK, TERMINAL_FIT_DEBOUNCE_MS } from "../../lib/panel-limits";

const XTERM_THEME = {
  background: "#09090A",
  foreground: "#F5F7FA",
  cursor: "#00E0FF",
  cursorAccent: "#0E0E0F",
  black: "#3B4658",
  red: "#EF4444",
  green: "#2FBF71",
  yellow: "#F59E0B",
  blue: "#61AFEF",
  magenta: "#C678DD",
  cyan: "#00E0FF",
  white: "#F5F7FA",
  brightBlack: "#8A95A6",
  brightRed: "#FF6B6B",
  brightGreen: "#4ADE80",
  brightYellow: "#FCD34D",
  brightBlue: "#7DD3FC",
  brightMagenta: "#E879F9",
  brightCyan: "#7CEBFF",
  brightWhite: "#FFFFFF",
};

export interface XtermTerminalProps {
  /** PTY id already created by the parent (main assigns `term-*`). */
  terminalId: string;
  isActive: boolean;
  fontSize?: number;
  onSelectionChange?: (text: string) => void;
}

/**
 * Interactive xterm.js view for an existing PTY session.
 * Parent owns create/destroy; this component owns write/resize + ANSI rendering.
 */
export function XtermTerminal({
  terminalId,
  isActive,
  fontSize = 12,
  onSelectionChange,
}: XtermTerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const isActiveRef = useRef(isActive);
  const onSelectionChangeRef = useRef(onSelectionChange);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  const fitTerminal = useCallback(() => {
    const fitAddon = fitRef.current;
    const term = termRef.current;
    if (!fitAddon || !term) return;
    try {
      fitAddon.fit();
    } catch {
      return;
    }
    const dims = fitAddon.proposeDimensions();
    if (dims && dims.cols > 0 && dims.rows > 0) {
      void window.caval?.terminal?.resize?.(terminalId, dims.cols, dims.rows);
    }
  }, [terminalId]);

  useEffect(() => {
    if (!isActive) return;
    const timer = window.setTimeout(() => fitTerminal(), 0);
    return () => window.clearTimeout(timer);
  }, [isActive, fitTerminal]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    if (isActiveRef.current) fitTerminal();
  }, [fontSize, fitTerminal]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
      fontSize,
      lineHeight: 1.45,
      cursorBlink: true,
      cursorStyle: "bar",
      theme: XTERM_THEME,
      scrollback: MAX_TERMINAL_SCROLLBACK,
      allowProposedApi: true,
      convertEol: false,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    termRef.current = term;
    fitRef.current = fitAddon;

    term.open(host);
    try {
      fitAddon.fit();
    } catch {
      /* host may be hidden on first mount */
    }

    const onContextMenu = (e: MouseEvent) => {
      const selection = term.getSelection();
      if (!selection) return;
      e.preventDefault();
      void navigator.clipboard.writeText(selection);
    };
    host.addEventListener("contextmenu", onContextMenu);

    let fitTimer: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (!isActiveRef.current) return;
      if (fitTimer !== null) window.clearTimeout(fitTimer);
      fitTimer = window.setTimeout(() => {
        fitTimer = null;
        fitTerminal();
      }, TERMINAL_FIT_DEBOUNCE_MS);
    });
    resizeObserver.observe(host);

    const dataDisposable = term.onData((data) => {
      void window.caval?.terminal?.write?.(terminalId, data);
    });

    const selectionDisposable = term.onSelectionChange(() => {
      onSelectionChangeRef.current?.(term.getSelection());
    });

    const unsubscribeOutput = window.caval?.terminal?.onOutput?.((line) => {
      if (line.terminalId !== terminalId) return;
      term.write(line.data);
    });

    const onTerminalWrite = (e: Event) => {
      const detail = (e as CustomEvent<{ data?: string; cmd?: string; sessionId?: string }>)
        .detail;
      if (detail?.sessionId && detail.sessionId !== terminalId) return;
      if (!detail?.sessionId && !isActiveRef.current) return;
      const payload = detail?.data ?? detail?.cmd;
      if (!payload) return;
      const data = payload.endsWith("\r") || payload.endsWith("\n") ? payload : `${payload}\r`;
      void window.caval?.terminal?.write?.(terminalId, data);
    };
    document.addEventListener("caval:terminal-write", onTerminalWrite);
    document.addEventListener("caval:run-in-terminal", onTerminalWrite);

    if (isActiveRef.current) {
      term.focus();
      fitTerminal();
    }

    return () => {
      document.removeEventListener("caval:terminal-write", onTerminalWrite);
      document.removeEventListener("caval:run-in-terminal", onTerminalWrite);
      if (fitTimer !== null) window.clearTimeout(fitTimer);
      resizeObserver.disconnect();
      host.removeEventListener("contextmenu", onContextMenu);
      unsubscribeOutput?.();
      dataDisposable.dispose();
      selectionDisposable.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [terminalId, fitTerminal]);

  useEffect(() => {
    if (!isActive) return;
    termRef.current?.focus();
  }, [isActive]);

  return (
    <div
      ref={hostRef}
      className="xterm-terminal-host"
      data-testid={`xterm-host-${terminalId}`}
      style={{
        width: "100%",
        height: "100%",
        padding: "4px 6px",
        display: isActive ? "block" : "none",
        position: "absolute",
        inset: 0,
        boxSizing: "border-box",
      }}
    />
  );
}

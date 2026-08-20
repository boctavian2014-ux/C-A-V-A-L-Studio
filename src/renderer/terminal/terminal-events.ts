export type TerminalPanelTab = 'terminal' | 'output' | 'problems' | 'tasks' | 'debug';

export function dispatchTerminalPanelTab(tab: TerminalPanelTab): void {
  document.dispatchEvent(
    new CustomEvent('caval:terminal-panel-tab', { detail: { tab } })
  );
}

export function dispatchTerminalNew(): void {
  document.dispatchEvent(new CustomEvent('caval:terminal-new'));
}

export function dispatchTerminalSplit(): void {
  document.dispatchEvent(new CustomEvent('caval:terminal-split'));
}

export function dispatchTerminalToggle(): void {
  document.dispatchEvent(new CustomEvent('caval:terminal-toggle'));
}

export function dispatchTerminalWrite(data: string, sessionId?: string): void {
  document.dispatchEvent(
    new CustomEvent('caval:terminal-write', { detail: { data, sessionId } })
  );
}

export function dispatchRunInTerminal(cmd: string): void {
  document.dispatchEvent(
    new CustomEvent('caval:run-in-terminal', { detail: { cmd, data: cmd } })
  );
}

/** 7c.3 — command palette → terminal AI actions (handled by TerminalSessions). */
export type TerminalAiPaletteAction = 'explain' | 'suggest-fix';

export function dispatchTerminalAiPalette(action: TerminalAiPaletteAction): void {
  document.dispatchEvent(
    new CustomEvent('caval:terminal-ai-palette', { detail: { action } })
  );
}

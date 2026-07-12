export type TerminalPanelTab = 'terminal' | 'output' | 'problems' | 'debug';

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

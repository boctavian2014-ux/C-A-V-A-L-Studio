export interface TerminalSessionMeta {
  id: string;
  title: string;
  containerId: string;
}

let terminalCounter = 0;

function defaultTitle(index: number): string {
  // Prefer PowerShell 7 label on Windows (shell is resolved/installed in main).
  if (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform)) {
    return `pwsh ${index}`;
  }
  if (typeof process !== 'undefined' && process.platform === 'win32') {
    return `pwsh ${index}`;
  }
  return `terminal ${index}`;
}

export function createTerminalSessionMeta(existingCount = 0): TerminalSessionMeta {
  terminalCounter += 1;
  const id = `terminal-${terminalCounter}`;
  const index = existingCount + 1;
  return {
    id,
    title: defaultTitle(index),
    containerId: `caval-terminal-${id}`,
  };
}

export function createInitialTerminalSession(): TerminalSessionMeta {
  return createTerminalSessionMeta(0);
}

/** @internal test helper */
export function resetTerminalSessionCounter(): void {
  terminalCounter = 0;
}

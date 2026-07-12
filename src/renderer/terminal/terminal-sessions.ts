export interface TerminalSessionMeta {
  id: string;
  title: string;
  containerId: string;
}

let terminalCounter = 0;

export function createTerminalSessionMeta(existingCount = 0): TerminalSessionMeta {
  terminalCounter += 1;
  const id = `terminal-${terminalCounter}`;
  const index = existingCount + 1;
  return {
    id,
    title: `powershell ${index}`,
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

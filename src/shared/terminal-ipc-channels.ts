/** Internal IPC channel names (main ↔ preload). Not exposed to renderer directly. */
export const TERMINAL_CHANNELS = {
  create: "terminal:create",
  write: "terminal:write",
  resize: "terminal:resize",
  destroy: "terminal:destroy",
  getInfo: "terminal:get-info",
  list: "terminal:list",
  output: "terminal:output",
  exit: "terminal:exit",
} as const;

export type TerminalIpcChannel = (typeof TERMINAL_CHANNELS)[keyof typeof TERMINAL_CHANNELS];

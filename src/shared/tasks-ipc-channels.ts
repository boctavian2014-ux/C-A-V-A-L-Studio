/** Internal IPC channel names (main ↔ preload). Not exposed to renderer directly. */
export const TASKS_CHANNELS = {
  list: "tasks:list",
  run: "tasks:run",
  stop: "tasks:stop",
  getRun: "tasks:get-run",
  getRuns: "tasks:get-runs",
  runChanged: "tasks:run-changed",
  output: "tasks:output",
} as const;

export type TasksIpcChannel = (typeof TASKS_CHANNELS)[keyof typeof TASKS_CHANNELS];

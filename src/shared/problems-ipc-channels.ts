/** Internal IPC channel names (main ↔ preload). Not exposed to renderer directly. */
export const PROBLEMS_CHANNELS = {
  getProblems: "problems:get",
  getSummary: "problems:get-summary",
  refresh: "problems:refresh",
  problemsChanged: "problems:changed",
  summaryChanged: "problems:summary-changed",
} as const;

export type ProblemsIpcChannel = (typeof PROBLEMS_CHANNELS)[keyof typeof PROBLEMS_CHANNELS];

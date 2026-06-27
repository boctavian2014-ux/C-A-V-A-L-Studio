const abortControllers = new Map<string, AbortController>();

export const registerJobAbort = (jobId: string): AbortSignal => {
  cancelJobProcessing(jobId);
  const controller = new AbortController();
  abortControllers.set(jobId, controller);
  return controller.signal;
};

export const cancelJobProcessing = (jobId: string): boolean => {
  const existing = abortControllers.get(jobId);
  if (!existing) return false;
  existing.abort();
  abortControllers.delete(jobId);
  return true;
};

export const clearJobAbort = (jobId: string): void => {
  abortControllers.delete(jobId);
};

export const isJobAborted = (jobId: string): boolean =>
  abortControllers.get(jobId)?.signal.aborted ?? false;

export const resetJobRegistryForTests = (): void => {
  for (const controller of abortControllers.values()) controller.abort();
  abortControllers.clear();
};

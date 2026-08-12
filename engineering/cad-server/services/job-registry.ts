const abortControllers = new Map<string, AbortController>();
const abortedJobIds = new Set<string>();

export const registerJobAbort = (jobId: string): AbortSignal => {
  abortControllers.get(jobId)?.abort();
  abortControllers.delete(jobId);
  abortedJobIds.delete(jobId);
  const controller = new AbortController();
  abortControllers.set(jobId, controller);
  return controller.signal;
};

export const cancelJobProcessing = (jobId: string): boolean => {
  const existing = abortControllers.get(jobId);
  if (existing) existing.abort();
  abortedJobIds.add(jobId);
  abortControllers.delete(jobId);
  return Boolean(existing);
};

export const clearJobAbort = (jobId: string): void => {
  abortControllers.delete(jobId);
  abortedJobIds.delete(jobId);
};

export const isJobAborted = (jobId: string): boolean =>
  abortedJobIds.has(jobId) || (abortControllers.get(jobId)?.signal.aborted ?? false);

export const resetJobRegistryForTests = (): void => {
  for (const controller of abortControllers.values()) controller.abort();
  abortControllers.clear();
  abortedJobIds.clear();
};

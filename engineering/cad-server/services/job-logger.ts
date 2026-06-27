import type { CadJobLogEntry } from "../types";

const logs = new Map<string, CadJobLogEntry[]>();
const MAX_LOGS_PER_JOB = 200;

export const appendJobLog = (
  jobId: string,
  entry: Omit<CadJobLogEntry, "at"> & { at?: string }
): CadJobLogEntry => {
  const record: CadJobLogEntry = {
    at: entry.at ?? new Date().toISOString(),
    level: entry.level,
    event: entry.event,
    message: entry.message,
    meta: entry.meta,
  };
  const list = logs.get(jobId) ?? [];
  list.push(record);
  if (list.length > MAX_LOGS_PER_JOB) list.splice(0, list.length - MAX_LOGS_PER_JOB);
  logs.set(jobId, list);
  return record;
};

export const getJobLogs = (jobId: string): CadJobLogEntry[] =>
  [...(logs.get(jobId) ?? [])];

export const clearJobLogs = (jobId: string): void => {
  logs.delete(jobId);
};

export const resetAllJobLogsForTests = (): void => {
  logs.clear();
};

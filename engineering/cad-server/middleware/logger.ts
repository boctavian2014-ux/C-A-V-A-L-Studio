const LOG_PREFIX = "[cad]";

export type CadLogLevel = "info" | "warn" | "error" | "debug";

export interface CadStructuredLog {
  level: CadLogLevel;
  event: string;
  jobId?: string;
  cavalId?: string;
  message?: string;
  meta?: Record<string, unknown>;
}

export const cadLog = (entry: CadStructuredLog): void => {
  const payload = {
    ts: new Date().toISOString(),
    service: "cad",
    ...entry,
  };
  const line = JSON.stringify(payload);
  if (entry.level === "error") console.error(LOG_PREFIX, line);
  else if (entry.level === "warn") console.warn(LOG_PREFIX, line);
  else console.info(LOG_PREFIX, line);
};

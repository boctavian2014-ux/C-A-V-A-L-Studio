import fs from "node:fs/promises";
import path from "node:path";

export interface AuditEntry {
  at: string;
  channel: string;
  action: string;
  workspaceRoot?: string;
  detail?: string;
  ok: boolean;
}

const MAX_MEMORY = 500;
const memoryLog: AuditEntry[] = [];

export function recordAudit(entry: Omit<AuditEntry, "at">): void {
  const row: AuditEntry = { ...entry, at: new Date().toISOString() };
  memoryLog.push(row);
  if (memoryLog.length > MAX_MEMORY) memoryLog.shift();
}

export function getAuditLog(limit = 100): AuditEntry[] {
  return memoryLog.slice(-limit);
}

export async function persistAuditLog(workspaceRoot: string): Promise<void> {
  if (!workspaceRoot?.trim() || memoryLog.length === 0) return;
  const dir = path.join(workspaceRoot, ".cavalo", "audit");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "ipc-audit.jsonl");
  const lines = memoryLog.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await fs.appendFile(file, lines, "utf8");
  memoryLog.length = 0;
}

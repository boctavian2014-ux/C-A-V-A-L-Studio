import fs from "node:fs";
import path from "node:path";
import { normalizeWorkspaceRoot } from "./path-security";

/**
 * SEC-P3-CAD-ANTI-DUP-001
 *
 * Workspace-level CAD lock state.
 * One active CAD job per workspace, regardless of sender.
 */

export type CadLockPhase =
  | "creating"
  | "running"
  | "cancelling"
  | "completed"
  | "failed"
  | "aborted"
  | "orphaned";

export interface CadWorkspaceLockRecord {
  lockKey: string;
  workspaceRoot: string;
  senderId: number;
  operationId: string;
  jobId: string | null;
  phase: CadLockPhase;
  lastHeartbeatAt: number;
  createdAt: number;
}

export interface AcquireCadLockInput {
  workspaceRoot: string;
  senderId: number;
  operationId?: string;
}

export type AcquireCadLockResult =
  | { ok: true; acquired: true; lock: CadWorkspaceLockRecord }
  | {
      ok: false;
      code: "cad_job_in_progress";
      jobId: string | null;
      operationId: string;
      phase: CadLockPhase;
      ownerIsCaller: boolean;
      /** Safe message for UI — never include prompt/output */
      message: string;
    }
  | { ok: false; code: "invalid_workspace"; error: string };

const HEARTBEAT_TIMEOUT_MS = 120_000;
const CAD_JOB_IN_PROGRESS_MESSAGE = "Un job CAD este deja în curs în acest workspace";

const locksByKey = new Map<string, CadWorkspaceLockRecord>();
const lockKeyByOperationId = new Map<string, string>();
const lockKeyByJobId = new Map<string, string>();

export function newCadOperationId(): string {
  return `cad-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function resolveCadWorkspaceIdentity(workspaceRoot: string): {
  workspaceRoot: string;
  lockKey: string;
} {
  const trimmed = workspaceRoot?.trim();
  if (!trimmed) {
    throw new Error("Invalid workspace root");
  }

  const normalized = normalizeWorkspaceRoot(trimmed);
  try {
    const real = fs.realpathSync(normalized);
    return {
      workspaceRoot: real,
      lockKey: `cad:${real}`,
    };
  } catch {
    const fallback = path.resolve(normalized);
    return {
      workspaceRoot: fallback,
      lockKey: `cad:${fallback}`,
    };
  }
}

function getLockByOperationId(operationId?: string): CadWorkspaceLockRecord | undefined {
  if (!operationId?.trim()) return undefined;
  const lockKey = lockKeyByOperationId.get(operationId);
  return lockKey ? locksByKey.get(lockKey) : undefined;
}

function getLockByJobId(jobId?: string): CadWorkspaceLockRecord | undefined {
  if (!jobId?.trim()) return undefined;
  const lockKey = lockKeyByJobId.get(jobId);
  return lockKey ? locksByKey.get(lockKey) : undefined;
}

function getLockByWorkspaceRoot(workspaceRoot?: string): CadWorkspaceLockRecord | undefined {
  if (!workspaceRoot?.trim()) return undefined;
  const { lockKey } = resolveCadWorkspaceIdentity(workspaceRoot);
  return locksByKey.get(lockKey);
}

function getLockFromLookup(opts: {
  operationId?: string;
  jobId?: string;
  workspaceRoot?: string;
}): CadWorkspaceLockRecord | undefined {
  return (
    getLockByOperationId(opts.operationId) ??
    getLockByJobId(opts.jobId) ??
    getLockByWorkspaceRoot(opts.workspaceRoot)
  );
}

function isTerminalPhase(phase: CadLockPhase): boolean {
  return phase === "completed" || phase === "failed" || phase === "aborted";
}

function removeLockMappings(lock: CadWorkspaceLockRecord): void {
  locksByKey.delete(lock.lockKey);
  if (lockKeyByOperationId.get(lock.operationId) === lock.lockKey) {
    lockKeyByOperationId.delete(lock.operationId);
  }
  if (lock.jobId && lockKeyByJobId.get(lock.jobId) === lock.lockKey) {
    lockKeyByJobId.delete(lock.jobId);
  }
}

function updateHeartbeat(lock: CadWorkspaceLockRecord, now: number): void {
  lock.lastHeartbeatAt = now;
  if (lock.phase === "creating" || lock.phase === "orphaned") {
    lock.phase = "running";
  }
}

export function cadLockKeyForWorkspace(workspaceRoot: string): string {
  return resolveCadWorkspaceIdentity(workspaceRoot).lockKey;
}

export function acquireCadWorkspaceLock(input: AcquireCadLockInput): AcquireCadLockResult {
  const trimmed = input.workspaceRoot?.trim();
  if (!trimmed) {
    return { ok: false, code: "invalid_workspace", error: "Invalid workspace root" };
  }

  let identity: { workspaceRoot: string; lockKey: string };
  try {
    identity = resolveCadWorkspaceIdentity(trimmed);
  } catch (error) {
    return {
      ok: false,
      code: "invalid_workspace",
      error: error instanceof Error ? error.message : "Invalid workspace root",
    };
  }

  const operationId = input.operationId?.trim() || newCadOperationId();
  const existingByOperation = getLockByOperationId(operationId);
  if (existingByOperation && !isTerminalPhase(existingByOperation.phase)) {
    return {
      ok: false,
      code: "cad_job_in_progress",
      jobId: existingByOperation.jobId,
      operationId: existingByOperation.operationId,
      phase: existingByOperation.phase,
      ownerIsCaller: existingByOperation.senderId === input.senderId,
      message: CAD_JOB_IN_PROGRESS_MESSAGE,
    };
  }

  const existing = locksByKey.get(identity.lockKey);
  if (existing && !isTerminalPhase(existing.phase)) {
    return {
      ok: false,
      code: "cad_job_in_progress",
      jobId: existing.jobId,
      operationId: existing.operationId,
      phase: existing.phase,
      ownerIsCaller: existing.senderId === input.senderId,
      message: CAD_JOB_IN_PROGRESS_MESSAGE,
    };
  }
  if (existing) {
    removeLockMappings(existing);
  }

  const now = Date.now();
  const lock: CadWorkspaceLockRecord = {
    lockKey: identity.lockKey,
    workspaceRoot: identity.workspaceRoot,
    senderId: input.senderId,
    operationId,
    jobId: null,
    phase: "creating",
    lastHeartbeatAt: now,
    createdAt: now,
  };

  locksByKey.set(lock.lockKey, lock);
  lockKeyByOperationId.set(operationId, lock.lockKey);
  return { ok: true, acquired: true, lock };
}

export function bindCadLockJobId(lockKeyOrOperationId: string, jobId: string): boolean {
  if (!lockKeyOrOperationId?.trim() || !jobId?.trim()) return false;

  const lock =
    locksByKey.get(lockKeyOrOperationId) ?? getLockByOperationId(lockKeyOrOperationId);
  if (!lock || isTerminalPhase(lock.phase)) return false;

  if (lock.jobId && lock.jobId !== jobId) {
    if (lockKeyByJobId.get(lock.jobId) === lock.lockKey) {
      lockKeyByJobId.delete(lock.jobId);
    }
  }

  lock.jobId = jobId;
  lockKeyByJobId.set(jobId, lock.lockKey);
  if (lock.phase === "creating" || lock.phase === "orphaned") {
    lock.phase = "running";
  }
  lock.lastHeartbeatAt = Date.now();
  return true;
}

export function getCadWorkspaceLock(workspaceRoot: string): CadWorkspaceLockRecord | undefined {
  if (!workspaceRoot?.trim()) return undefined;
  try {
    return locksByKey.get(cadLockKeyForWorkspace(workspaceRoot));
  } catch {
    return undefined;
  }
}

export function getCadLockSafePublicMeta(
  lock: CadWorkspaceLockRecord,
  requesterSenderId: number
): {
  code: "cad_job_in_progress";
  jobId: string | null;
  operationId: string;
  phase: CadLockPhase;
  ownerIsCaller: boolean;
  message: string;
} {
  return {
    code: "cad_job_in_progress",
    jobId: lock.jobId,
    operationId: lock.operationId,
    phase: lock.phase,
    ownerIsCaller: lock.senderId === requesterSenderId,
    message: CAD_JOB_IN_PROGRESS_MESSAGE,
  };
}

export function heartbeatCadWorkspaceLock(opts: {
  operationId?: string;
  jobId?: string;
  workspaceRoot?: string;
}): boolean {
  const lock = getLockFromLookup(opts);
  if (!lock || isTerminalPhase(lock.phase)) return false;
  updateHeartbeat(lock, Date.now());
  return true;
}

export function touchCadLockHeartbeat(opts: {
  operationId?: string;
  jobId?: string;
  workspaceRoot?: string;
  at?: number;
}): void {
  const lock = getLockFromLookup(opts);
  if (!lock || isTerminalPhase(lock.phase)) return;
  updateHeartbeat(lock, typeof opts.at === "number" ? opts.at : Date.now());
}

export function releaseCadWorkspaceLock(opts: {
  operationId?: string;
  jobId?: string;
  workspaceRoot?: string;
  expectedOperationId?: string;
  reason: "completed" | "failed" | "aborted" | "timeout" | "cleanup" | "orphaned";
}): { released: boolean; reason?: string } {
  const lock = getLockFromLookup(opts);
  if (!lock) {
    return { released: false, reason: "lock not found" };
  }

  if (!opts.operationId?.trim() && !opts.jobId?.trim() && !opts.expectedOperationId?.trim()) {
    return { released: false, reason: "missing release identifiers" };
  }
  if (opts.workspaceRoot?.trim() && lock.lockKey !== cadLockKeyForWorkspace(opts.workspaceRoot)) {
    return { released: false, reason: "workspace mismatch" };
  }
  if (opts.operationId?.trim() && lock.operationId !== opts.operationId.trim()) {
    return { released: false, reason: "operation mismatch" };
  }
  if (opts.expectedOperationId?.trim() && lock.operationId !== opts.expectedOperationId.trim()) {
    return { released: false, reason: "expected operation mismatch" };
  }
  if (opts.jobId?.trim() && lock.jobId !== opts.jobId.trim()) {
    return { released: false, reason: "job mismatch" };
  }

  removeLockMappings(lock);
  return { released: true, reason: opts.reason };
}

export function markCadLockCancelling(opts: {
  operationId?: string;
  jobId?: string;
  workspaceRoot?: string;
  senderId: number;
}): { ok: true } | { ok: false; error: string } {
  const lock = getLockFromLookup(opts);
  if (!lock) {
    return { ok: false, error: "CAD lock not found" };
  }
  if (lock.senderId !== opts.senderId) {
    return { ok: false, error: "CAD lock owned by another sender" };
  }
  if (isTerminalPhase(lock.phase)) {
    return { ok: true };
  }
  lock.phase = "cancelling";
  lock.lastHeartbeatAt = Date.now();
  return { ok: true };
}

export function scanCadLockOrphans(now = Date.now()): CadWorkspaceLockRecord[] {
  const orphaned: CadWorkspaceLockRecord[] = [];
  for (const lock of locksByKey.values()) {
    if (isTerminalPhase(lock.phase)) {
      continue;
    }
    const stale = now - lock.lastHeartbeatAt >= HEARTBEAT_TIMEOUT_MS;
    if (stale) {
      lock.phase = "orphaned";
    }
    if (lock.phase === "orphaned") {
      orphaned.push(lock);
    }
  }
  return orphaned;
}

export function resetCadWorkspaceLocksForTests(): void {
  locksByKey.clear();
  lockKeyByOperationId.clear();
  lockKeyByJobId.clear();
}


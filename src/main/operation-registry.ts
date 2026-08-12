/**
 * P2 — unified AI + CAD operation identity and cancel.
 * SEC-P2-UNIFIED-ABORT-001
 */

export type OperationStatus =
  | "running"
  | "aborting"
  | "aborted"
  | "completed"
  | "failed";

export type RemoteCancelResult = "ok" | "failed" | "skipped";

export interface OperationRecord {
  operationId: string;
  streamId?: string;
  cadJobId?: string;
  senderId: number;
  workspaceRoot: string;
  status: OperationStatus;
  controller: AbortController;
}

const operationsById = new Map<string, OperationRecord>();
const operationByStreamId = new Map<string, string>();
const operationByCadJobId = new Map<string, string>();

/** streamId → AbortController for ask-mode completions (also held on OperationRecord). */
const streamControllers = new Map<string, AbortController>();

/** jobId → owner for cross-sender/workspace deny */
const cadJobOwners = new Map<string, { senderId: number; workspaceRoot: string }>();

/** At most one remote CAD DELETE per jobId */
const issuedCadCancels = new Set<string>();

export function newOperationId(): string {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** @internal tests */
export function resetOperationRegistryForTests(): void {
  operationsById.clear();
  operationByStreamId.clear();
  operationByCadJobId.clear();
  streamControllers.clear();
  cadJobOwners.clear();
  issuedCadCancels.clear();
}

export function registerStreamOperation(input: {
  streamId: string;
  senderId: number;
  workspaceRoot?: string;
  operationId?: string;
}): OperationRecord {
  const existingId = operationByStreamId.get(input.streamId);
  if (existingId) {
    const existing = operationsById.get(existingId);
    if (existing && existing.status === "running") {
      return existing;
    }
  }

  const operationId = input.operationId ?? newOperationId();
  const controller = new AbortController();
  const record: OperationRecord = {
    operationId,
    streamId: input.streamId,
    senderId: input.senderId,
    workspaceRoot: (input.workspaceRoot ?? "").trim(),
    status: "running",
    controller,
  };
  operationsById.set(operationId, record);
  operationByStreamId.set(input.streamId, operationId);
  streamControllers.set(input.streamId, controller);
  return record;
}

export function getStreamAbortSignal(streamId: string): AbortSignal | undefined {
  return streamControllers.get(streamId)?.signal;
}

export function getOperationByStreamId(streamId: string): OperationRecord | undefined {
  const id = operationByStreamId.get(streamId);
  return id ? operationsById.get(id) : undefined;
}

export function getOperationById(operationId: string): OperationRecord | undefined {
  return operationsById.get(operationId);
}

export function getOperationByCadJobId(cadJobId: string): OperationRecord | undefined {
  const id = operationByCadJobId.get(cadJobId);
  return id ? operationsById.get(id) : undefined;
}

export function bindCadJobToOperation(
  operationId: string,
  cadJobId: string
): void {
  const op = operationsById.get(operationId);
  if (!op) return;
  if (op.cadJobId && op.cadJobId !== cadJobId) {
    operationByCadJobId.delete(op.cadJobId);
    cadJobOwners.delete(op.cadJobId);
  }
  op.cadJobId = cadJobId;
  operationByCadJobId.set(cadJobId, operationId);
  registerCadJobOwner(cadJobId, op.senderId, op.workspaceRoot);
}

export function registerCadJobOwner(
  jobId: string,
  senderId: number,
  workspaceRoot = ""
): void {
  cadJobOwners.set(jobId, { senderId, workspaceRoot: workspaceRoot.trim() });
  // Ensure an operation exists for CAD-only jobs.
  if (!operationByCadJobId.has(jobId)) {
    const operationId = newOperationId();
    const controller = new AbortController();
    const record: OperationRecord = {
      operationId,
      cadJobId: jobId,
      senderId,
      workspaceRoot: workspaceRoot.trim(),
      status: "running",
      controller,
    };
    operationsById.set(operationId, record);
    operationByCadJobId.set(jobId, operationId);
  }
}

export function ensureCadOperationBound(input: {
  operationId: string;
  jobId: string;
  senderId: number;
  workspaceRoot?: string;
}): OperationRecord | undefined {
  const op = operationsById.get(input.operationId);
  if (!op) return undefined;

  op.senderId = input.senderId;
  op.workspaceRoot = (input.workspaceRoot ?? op.workspaceRoot ?? "").trim();
  bindCadJobToOperation(input.operationId, input.jobId);
  return op;
}

export function assertCadJobOwnedBySender(
  senderId: number,
  jobId: string,
  workspaceRoot?: string
): { ok: true } | { ok: false; error: string } {
  const owner = cadJobOwners.get(jobId);
  if (!owner) {
    // Unknown/expired — allow same-sender best-effort cancel (idempotent).
    return { ok: true };
  }
  if (owner.senderId !== senderId) {
    return { ok: false, error: "Cross-sender CAD job control denied" };
  }
  if (
    workspaceRoot?.trim() &&
    owner.workspaceRoot &&
    owner.workspaceRoot !== workspaceRoot.trim()
  ) {
    return { ok: false, error: "Cross-workspace CAD job control denied" };
  }
  return { ok: true };
}

export function markOperationTerminal(
  streamId: string | undefined,
  status: "completed" | "failed" | "aborted"
): void {
  if (!streamId) return;
  const op = getOperationByStreamId(streamId);
  if (!op) return;
  if (op.status === "aborted" || op.status === "completed" || op.status === "failed") {
    return;
  }
  op.status = status;
  streamControllers.delete(streamId);
}

export function shouldIssueCadCancelOnce(jobId: string): boolean {
  if (!jobId) return false;
  if (issuedCadCancels.has(jobId)) return false;
  issuedCadCancels.add(jobId);
  return true;
}

export interface CancelOperationInput {
  operationId?: string;
  streamId?: string;
  cadJobId?: string;
  senderId: number;
  workspaceRoot?: string;
}

export interface CancelOperationResult {
  ok: boolean;
  status: OperationStatus | "unknown";
  operationId?: string;
  streamId?: string;
  cadJobId?: string;
  remoteCancel?: RemoteCancelResult;
  error?: string;
  /** True when AbortController.abort() was invoked for ask-mode. */
  signalAborted?: boolean;
}

/**
 * Resolve operation and abort AI signal. Caller performs CAD remote cancel
 * when result.cadJobId is set and shouldIssueCadCancelOnce returns true.
 */
export function beginCancelOperation(
  input: CancelOperationInput
): CancelOperationResult {
  let op: OperationRecord | undefined;
  if (input.operationId) op = operationsById.get(input.operationId);
  if (!op && input.streamId) op = getOperationByStreamId(input.streamId);
  if (!op && input.cadJobId) op = getOperationByCadJobId(input.cadJobId);

  if (!op) {
    // Still try to abort a known stream controller (race with registration).
    if (input.streamId) {
      const c = streamControllers.get(input.streamId);
      if (c) {
        if (!c.signal.aborted) c.abort();
        streamControllers.delete(input.streamId);
        return {
          ok: true,
          status: "aborted",
          streamId: input.streamId,
          cadJobId: input.cadJobId,
          signalAborted: true,
          remoteCancel: input.cadJobId ? "skipped" : "skipped",
        };
      }
    }
    return {
      ok: true,
      status: "unknown",
      streamId: input.streamId,
      cadJobId: input.cadJobId,
      remoteCancel: "skipped",
    };
  }

  if (op.senderId !== input.senderId) {
    return { ok: false, status: op.status, error: "Cross-sender operation control denied" };
  }
  if (
    input.workspaceRoot?.trim() &&
    op.workspaceRoot &&
    op.workspaceRoot !== input.workspaceRoot.trim()
  ) {
    return { ok: false, status: op.status, error: "Cross-workspace operation control denied" };
  }

  if (op.status === "aborted" || op.status === "completed" || op.status === "failed") {
    return {
      ok: true,
      status: op.status,
      operationId: op.operationId,
      streamId: op.streamId,
      cadJobId: op.cadJobId ?? input.cadJobId,
      signalAborted: false,
      remoteCancel: "skipped",
    };
  }

  op.status = "aborting";
  let signalAborted = false;
  if (!op.controller.signal.aborted) {
    op.controller.abort();
    signalAborted = true;
  }
  if (op.streamId) {
    streamControllers.delete(op.streamId);
  }
  op.status = "aborted";

  return {
    ok: true,
    status: "aborted",
    operationId: op.operationId,
    streamId: op.streamId,
    cadJobId: op.cadJobId ?? input.cadJobId,
    signalAborted,
    remoteCancel: "skipped",
  };
}

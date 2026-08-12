import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acquireCadWorkspaceLock,
  bindCadLockJobId,
  getCadLockSafePublicMeta,
  getCadWorkspaceLock,
  heartbeatCadWorkspaceLock,
  markCadLockCancelling,
  releaseCadWorkspaceLock,
  resetCadWorkspaceLocksForTests,
  scanCadLockOrphans,
} from "../../src/main/cad-workspace-lock";
import {
  cancelJobProcessing,
  clearJobAbort,
  isJobAborted,
  registerJobAbort,
  resetJobRegistryForTests,
} from "../../engineering/cad-server/services/job-registry";

describe("P3 CAD workspace lock", () => {
  const wsA = "C:\\tmp\\caval-p3-ws-a";
  const wsB = "C:\\tmp\\caval-p3-ws-b";

  beforeEach(() => {
    resetCadWorkspaceLocksForTests();
  });

  afterEach(() => {
    resetCadWorkspaceLocksForTests();
  });

  it("two creates same workspace different senders => one job lock", () => {
    const first = acquireCadWorkspaceLock({ workspaceRoot: wsA, senderId: 1 });
    expect(first.ok).toBe(true);
    if (!first.ok || !("acquired" in first)) return;
    bindCadLockJobId(first.lock.operationId, "job-1");

    const second = acquireCadWorkspaceLock({ workspaceRoot: wsA, senderId: 2 });
    expect(second.ok).toBe(false);
    if (second.ok || second.code !== "cad_job_in_progress") return;
    expect(second.jobId).toBe("job-1");
    expect(second.ownerIsCaller).toBe(false);
    expect(second.message).toMatch(/deja în curs/i);

    const meta = getCadLockSafePublicMeta(getCadWorkspaceLock(wsA)!, 2);
    expect(meta.ownerIsCaller).toBe(false);
    expect(JSON.stringify(meta)).not.toMatch(/prompt/i);
  });

  it("create + retry style second acquire is denied until release", () => {
    const first = acquireCadWorkspaceLock({ workspaceRoot: wsA, senderId: 1 });
    expect(first.ok).toBe(true);
    if (!first.ok || !("acquired" in first)) return;
    const retry = acquireCadWorkspaceLock({ workspaceRoot: wsA, senderId: 1 });
    expect(retry.ok).toBe(false);
    if (retry.ok || retry.code !== "cad_job_in_progress") return;
    expect(retry.ownerIsCaller).toBe(true);

    releaseCadWorkspaceLock({
      operationId: first.lock.operationId,
      reason: "failed",
    });
    const again = acquireCadWorkspaceLock({ workspaceRoot: wsA, senderId: 1 });
    expect(again.ok).toBe(true);
  });

  it("different workspaces can run in parallel", () => {
    const a = acquireCadWorkspaceLock({ workspaceRoot: wsA, senderId: 1 });
    const b = acquireCadWorkspaceLock({ workspaceRoot: wsB, senderId: 2 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("stale completion cannot release a newer lock", () => {
    const old = acquireCadWorkspaceLock({ workspaceRoot: wsA, senderId: 1 });
    expect(old.ok).toBe(true);
    if (!old.ok || !("acquired" in old)) return;
    bindCadLockJobId(old.lock.operationId, "old-job");
    releaseCadWorkspaceLock({
      operationId: old.lock.operationId,
      jobId: "old-job",
      reason: "completed",
    });

    const neu = acquireCadWorkspaceLock({ workspaceRoot: wsA, senderId: 1 });
    expect(neu.ok).toBe(true);
    if (!neu.ok || !("acquired" in neu)) return;
    bindCadLockJobId(neu.lock.operationId, "new-job");

    const stale = releaseCadWorkspaceLock({
      operationId: old.lock.operationId,
      jobId: "old-job",
      reason: "completed",
    });
    expect(stale.released).toBe(false);
    expect(getCadWorkspaceLock(wsA)?.jobId).toBe("new-job");
  });

  it("release exact-once for complete/fail/abort", () => {
    const acq = acquireCadWorkspaceLock({ workspaceRoot: wsA, senderId: 1 });
    expect(acq.ok).toBe(true);
    if (!acq.ok || !("acquired" in acq)) return;
    bindCadLockJobId(acq.lock.operationId, "j");
    const first = releaseCadWorkspaceLock({
      operationId: acq.lock.operationId,
      jobId: "j",
      reason: "aborted",
    });
    const second = releaseCadWorkspaceLock({
      operationId: acq.lock.operationId,
      jobId: "j",
      reason: "aborted",
    });
    expect(first.released).toBe(true);
    expect(second.released).toBe(false);
  });

  it("heartbeat-based orphan scan does not release healthy recent locks", () => {
    const acq = acquireCadWorkspaceLock({ workspaceRoot: wsA, senderId: 1 });
    expect(acq.ok).toBe(true);
    if (!acq.ok || !("acquired" in acq)) return;
    heartbeatCadWorkspaceLock({ operationId: acq.lock.operationId });
    const orphans = scanCadLockOrphans(Date.now());
    expect(orphans.find((o) => o.operationId === acq.lock.operationId)).toBeUndefined();
  });

  it("orphan scan marks stale heartbeat locks without auto-releasing", () => {
    const acq = acquireCadWorkspaceLock({ workspaceRoot: wsA, senderId: 1 });
    expect(acq.ok).toBe(true);
    if (!acq.ok || !("acquired" in acq)) return;
    const orphans = scanCadLockOrphans(Date.now() + 130_000);
    expect(orphans.some((o) => o.operationId === acq.lock.operationId)).toBe(true);
    expect(getCadWorkspaceLock(wsA)?.phase).toBe("orphaned");
  });

  it("other sender cannot mark cancelling", () => {
    const acq = acquireCadWorkspaceLock({ workspaceRoot: wsA, senderId: 1 });
    expect(acq.ok).toBe(true);
    if (!acq.ok || !("acquired" in acq)) return;
    const denied = markCadLockCancelling({
      operationId: acq.lock.operationId,
      senderId: 99,
    });
    expect(denied.ok).toBe(false);
  });
});

describe("P3 job-registry abort persistence (M1 / Δ4)", () => {
  beforeEach(() => resetJobRegistryForTests());
  afterEach(() => resetJobRegistryForTests());

  it("isJobAborted stays true after cancel until clearJobAbort", () => {
    registerJobAbort("job-x");
    expect(isJobAborted("job-x")).toBe(false);
    cancelJobProcessing("job-x");
    expect(isJobAborted("job-x")).toBe(true);
    clearJobAbort("job-x");
    expect(isJobAborted("job-x")).toBe(false);
  });
});

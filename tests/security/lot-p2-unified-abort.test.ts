import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { linkAbortWithTimeout } from '../../ai/model-router';
import {
  assertCadJobOwnedBySender,
  beginCancelOperation,
  getStreamAbortSignal,
  markOperationTerminal,
  registerCadJobOwner,
  registerStreamOperation,
  resetOperationRegistryForTests,
  shouldIssueCadCancelOnce,
} from '../../src/main/operation-registry';

describe('P2 unified cancel / operation registry', () => {
  beforeEach(() => {
    resetOperationRegistryForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('abort before chunk: signal aborted and status aborted', () => {
    const op = registerStreamOperation({
      streamId: 'eng-1',
      senderId: 1,
      workspaceRoot: '/ws',
    });
    expect(getStreamAbortSignal('eng-1')?.aborted).toBe(false);

    const result = beginCancelOperation({
      streamId: 'eng-1',
      senderId: 1,
      workspaceRoot: '/ws',
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe('aborted');
    expect(result.signalAborted).toBe(true);
    expect(op.controller.signal.aborted).toBe(true);
  });

  it('double cancel is idempotent and does not re-abort signal flag twice meaningfully', () => {
    registerStreamOperation({ streamId: 'eng-2', senderId: 1 });
    const first = beginCancelOperation({ streamId: 'eng-2', senderId: 1 });
    const second = beginCancelOperation({ streamId: 'eng-2', senderId: 1 });
    expect(first.signalAborted).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.status).toBe('aborted');
    expect(second.signalAborted).toBe(false);
  });

  it('cross-sender cancel is denied', () => {
    registerStreamOperation({ streamId: 'eng-3', senderId: 1, workspaceRoot: '/a' });
    const result = beginCancelOperation({ streamId: 'eng-3', senderId: 2 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Cross-sender/i);
    expect(getStreamAbortSignal('eng-3')?.aborted).toBe(false);
  });

  it('cross-workspace cancel is denied when both sides set', () => {
    registerStreamOperation({ streamId: 'eng-4', senderId: 1, workspaceRoot: '/a' });
    const result = beginCancelOperation({
      streamId: 'eng-4',
      senderId: 1,
      workspaceRoot: '/b',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Cross-workspace/i);
  });

  it('stale completed op is not re-opened by cancel', () => {
    registerStreamOperation({ streamId: 'eng-5', senderId: 1 });
    markOperationTerminal('eng-5', 'completed');
    const result = beginCancelOperation({ streamId: 'eng-5', senderId: 1 });
    expect(result.ok).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.remoteCancel).toBe('skipped');
  });

  it('CAD job ownership denies cross-sender', () => {
    registerCadJobOwner('job-1', 7, '/ws');
    expect(assertCadJobOwnedBySender(7, 'job-1', '/ws').ok).toBe(true);
    expect(assertCadJobOwnedBySender(8, 'job-1').ok).toBe(false);
  });

  it('CAD remote cancel issued at most once per jobId', () => {
    expect(shouldIssueCadCancelOnce('job-x')).toBe(true);
    expect(shouldIssueCadCancelOnce('job-x')).toBe(false);
  });

  it('linkAbortWithTimeout aborts when user signal aborts', () => {
    const user = new AbortController();
    const linked = linkAbortWithTimeout(user.signal, 60_000);
    expect(linked.signal.aborted).toBe(false);
    user.abort();
    expect(linked.signal.aborted).toBe(true);
    linked.cleanup();
  });

  it('linkAbortWithTimeout respects already-aborted user signal', () => {
    const user = new AbortController();
    user.abort();
    const linked = linkAbortWithTimeout(user.signal, 60_000);
    expect(linked.signal.aborted).toBe(true);
    linked.cleanup();
  });

  it('new stream op is unaffected by cancel of old stream', () => {
    registerStreamOperation({ streamId: 'old', senderId: 1 });
    registerStreamOperation({ streamId: 'new', senderId: 1 });
    beginCancelOperation({ streamId: 'old', senderId: 1 });
    expect(getStreamAbortSignal('old')).toBeUndefined();
    expect(getStreamAbortSignal('new')?.aborted).toBe(false);
  });
});

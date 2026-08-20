import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSectionCollector,
  shouldFlushStreamImmediately,
} from '../../ai/engineering/streaming-sections';
import { completeViaChatStream } from '../../ai/engineering/engineering-stream';
import {
  getIssuedChatAbortCount,
  resetIssuedChatAborts,
} from '../../ai/engineering/stream-abort-once';
import {
  shouldApplyStreamUpdate,
  useRoboticsSessionStore,
} from '../../src/renderer/store/robotics-session-store';

describe('P1 robotics streaming contract', () => {
  beforeEach(() => {
    resetIssuedChatAborts();
    useRoboticsSessionStore.setState({
      prompt: '',
      lastPrompt: '',
      loading: false,
      error: null,
      warning: null,
      project: null,
      plan: null,
      bom: null,
      activeTab: 'overview',
      streamProgress: null,
      userTabLocked: false,
      streamId: null,
      streamingMode: 'idle',
      reasoningActive: false,
      incomplete: false,
      streamSettled: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('three deltas: section list appears before done (acceptance)', async () => {
    const seenBeforeDone: number[] = [];
    let doneSeen = false;

    vi.stubGlobal('window', {
      caval: {
        chatStream: (_req: unknown, cb: (c: unknown) => void) => {
          queueMicrotask(() => {
            const collector = createSectionCollector();
            for (const delta of [
              '## PROJECT SUMMARY\nA\n',
              '## CAD 3D MODEL\ncube\n',
              '## ASSEMBLY STEPS\n1\n',
            ]) {
              cb({ streamId: 'eng-test', type: 'delta', delta });
              const snap = collector.push(delta);
              if (!doneSeen) seenBeforeDone.push(snap.total);
            }
            doneSeen = true;
            cb({ streamId: 'eng-test', type: 'done' });
          });
          return () => undefined;
        },
        abortChatStream: vi.fn(),
      },
    });

    const collector = createSectionCollector();
    const progressBeforeDone: number[] = [];
    let resolved = false;

    const resultPromise = completeViaChatStream({
      model: 'auto' as never,
      messages: [{ role: 'user', content: 'build a robot' }],
      onDelta: (d) => {
        if (!resolved) {
          progressBeforeDone.push(collector.push(d).total);
        }
      },
    }).then((r) => {
      resolved = true;
      return r;
    });

    await Promise.resolve();
    await Promise.resolve();
    const result = await resultPromise;

    expect(result.ok).toBe(true);
    expect(progressBeforeDone.some((t) => t > 0)).toBe(true);
    expect(Math.max(0, ...progressBeforeDone)).toBeGreaterThanOrEqual(2);
    expect(seenBeforeDone.some((t) => t > 0)).toBe(true);
  });

  it('abort before subscribe resolves immediately (no pending hang)', async () => {
    const abortChatStream = vi.fn();
    vi.stubGlobal('window', {
      caval: {
        chatStream: vi.fn(() => () => undefined),
        abortChatStream,
      },
    });

    const ac = new AbortController();
    ac.abort();

    const result = await Promise.race([
      completeViaChatStream({
        model: 'auto' as never,
        messages: [{ role: 'user', content: 'x' }],
        signal: ac.signal,
      }),
      new Promise<{ ok: false; error: string }>((_, reject) =>
        setTimeout(() => reject(new Error('hung')), 200)
      ),
    ]);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ ok: false, aborted: true });
    expect(abortChatStream).not.toHaveBeenCalled();
  });

  it('reasoning updates activity only; never document', async () => {
    vi.stubGlobal('window', {
      caval: {
        chatStream: (_req: unknown, cb: (c: unknown) => void) => {
          queueMicrotask(() => {
            cb({ streamId: 'eng-r', type: 'reasoning', reasoningDelta: 'SECRET_REASONING' });
            cb({ streamId: 'eng-r', type: 'delta', delta: '## PROJECT SUMMARY\nVisible\n' });
            cb({ streamId: 'eng-r', type: 'done' });
          });
          return () => undefined;
        },
        abortChatStream: vi.fn(),
      },
    });

    let reasoningHits = 0;
    let accumulated = '';
    const result = await completeViaChatStream({
      model: 'auto' as never,
      messages: [{ role: 'user', content: 'x' }],
      onDelta: (d) => {
        accumulated += d;
      },
      onReasoningActivity: () => {
        reasoningHits += 1;
      },
    });

    expect(reasoningHits).toBe(1);
    expect(accumulated).not.toContain('SECRET_REASONING');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).not.toContain('SECRET_REASONING');
  });

  it('first heading flushes immediately (before throttle window)', () => {
    const c = createSectionCollector();
    const snap = c.push('## PROJECT SUMMARY\nHello\n');
    expect(shouldFlushStreamImmediately(false, snap)).toBe(true);
    expect(shouldFlushStreamImmediately(true, snap)).toBe(false);
  });

  it('collector progress can paint without waiting for parseRoboticsPlan', () => {
    const c = createSectionCollector();
    const snap = c.push('## PROJECT SUMMARY\npartial body\n');
    // UI paints snap.sections directly — parse is optional follow-up.
    expect(snap.total).toBeGreaterThan(0);
    expect(snap.sections[0]?.content).toContain('partial body');
  });

  it('stale stream cannot clear loading/progress of a newer generation', () => {
    const store = useRoboticsSessionStore.getState();
    store.beginGenerate();
    store.setStreamId('eng-old');
    store.applyForStream('eng-old', {
      streamProgress: {
        sections: [{ key: 'summary', heading: 'S', content: 'old', status: 'generating' }],
        activeKey: 'summary',
        completed: 0,
        total: 1,
      },
    });

    // New generation starts
    store.beginGenerate();
    store.setStreamId('eng-new');
    store.setActiveTab('cad');
    store.setUserTabLocked(true);
    expect(useRoboticsSessionStore.getState().loading).toBe(true);

    // Old finalize must not wipe the new stream
    store.finalizeStream({
      forStreamId: 'eng-old',
      settle: true,
      clearProgress: true,
      callAbortChat: true,
    });

    const s = useRoboticsSessionStore.getState();
    expect(s.loading).toBe(true);
    expect(s.streamId).toBe('eng-new');
    expect(s.activeTab).toBe('cad');
    expect(s.streamSettled).toBe(false);
  });

  it('abortChatStream is issued at most once per streamId', () => {
    const abortChatStream = vi.fn();
    vi.stubGlobal('window', { caval: { abortChatStream } });

    const store = useRoboticsSessionStore.getState();
    store.beginGenerate();
    store.setStreamId('eng-once');

    store.finalizeStream({
      forStreamId: 'eng-once',
      callAbortChat: true,
      settle: true,
      incomplete: true,
    });
    store.finalizeStream({
      forStreamId: 'eng-once',
      callAbortChat: true,
      settle: true,
      incomplete: true,
    });

    expect(abortChatStream).toHaveBeenCalledTimes(1);
    expect(getIssuedChatAbortCount('eng-once')).toBe(1);
  });

  it('finalizeStream does not reset activeTab', () => {
    const store = useRoboticsSessionStore.getState();
    store.setActiveTab('parts');
    store.setUserTabLocked(true);
    store.beginGenerate();
    store.setStreamId('eng-tab');
    store.finalizeStream({
      forStreamId: 'eng-tab',
      settle: true,
      callAbortChat: false,
    });
    expect(useRoboticsSessionStore.getState().activeTab).toBe('parts');
    expect(useRoboticsSessionStore.getState().userTabLocked).toBe(true);
  });

  it('idempotent finalize Stop/done/error order does not throw', () => {
    const store = useRoboticsSessionStore.getState();
    store.beginGenerate();
    store.setStreamId('eng-idem');
    const ac = new AbortController();

    expect(() => {
      store.finalizeStream({
        forStreamId: 'eng-idem',
        abortController: ac,
        abortSignal: true,
        callAbortChat: true,
        settle: true,
        incomplete: true,
      });
      store.finalizeStream({
        forStreamId: 'eng-idem',
        abortController: ac,
        abortSignal: true,
        callAbortChat: true,
        settle: true,
        incomplete: true,
      });
      store.finalizeStream({
        forStreamId: 'eng-idem',
        callAbortChat: false,
        settle: true,
      });
    }).not.toThrow();
  });

  it('beginGenerate does not reset locked/selected tab', () => {
    const store = useRoboticsSessionStore.getState();
    store.setActiveTab('cad');
    store.setUserTabLocked(true);
    store.beginGenerate();
    const s = useRoboticsSessionStore.getState();
    expect(s.activeTab).toBe('cad');
    expect(s.userTabLocked).toBe(true);
  });

  it('loading blocks a second generate (Ctrl+Enter contract)', () => {
    useRoboticsSessionStore.getState().beginGenerate();
    expect(useRoboticsSessionStore.getState().loading).toBe(true);
  });

  it('error/incomplete keeps streamProgress (fallback failure contract)', () => {
    const store = useRoboticsSessionStore.getState();
    store.beginGenerate();
    store.setStreamId('eng-1');
    store.setStreamingMode('fallback');
    store.applyForStream('eng-1', {
      streamProgress: {
        sections: [
          { key: 'summary', heading: 'Summary', content: 'partial', status: 'generating' },
        ],
        activeKey: 'summary',
        completed: 0,
        total: 1,
      },
    });
    store.applyForStream('eng-1', {
      error: 'Provider unavailable',
      incomplete: true,
    });
    store.finalizeStream({
      callAbortChat: false,
      settle: true,
      incomplete: true,
      clearProgress: false,
      forStreamId: 'eng-1',
    });
    const s = useRoboticsSessionStore.getState();
    expect(s.streamProgress?.total).toBe(1);
    expect(s.incomplete).toBe(true);
    expect(s.error).toBe('Provider unavailable');
    expect(s.applyForStream('eng-1', { reasoningActive: true })).toBe(false);
  });

  it('shouldApplyStreamUpdate rejects settled and mismatched ids', () => {
    expect(shouldApplyStreamUpdate('a', 'a', false)).toBe(true);
    expect(shouldApplyStreamUpdate('a', 'b', false)).toBe(false);
    expect(shouldApplyStreamUpdate('a', 'a', true)).toBe(false);
  });

  it('abort during onStreamStart resolves and aborts once', async () => {
    const abortChatStream = vi.fn(async () => ({ ok: true }));
    const ac = new AbortController();
    vi.stubGlobal('window', {
      caval: {
        chatStream: () => () => undefined,
        abortChatStream,
      },
    });

    const result = await completeViaChatStream({
      model: 'auto' as never,
      messages: [{ role: 'user', content: 'x' }],
      signal: ac.signal,
      onStreamStart: () => {
        ac.abort();
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.aborted).toBe(true);
    expect(abortChatStream).toHaveBeenCalledTimes(1);
  });
});

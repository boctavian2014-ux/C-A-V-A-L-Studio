import type { CavalStreamChunk } from '../../src/main/preload';
import type { ModelSelectionId } from '../models/model-catalog';
import { issueAbortChatStreamOnce } from './stream-abort-once';

function generateStreamId(): string {
  return `eng-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function completeViaChatStream(params: {
  model: ModelSelectionId;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  workspaceRoot?: string | null;
  signal?: AbortSignal;
  /** Light intent for live stream TTFT; never deep_thinking on smoke path. */
  intent?: import('../types').RoutingIntent;
  /** Cap completion length on live/smoke path. */
  maxTokens?: number;
  /** Incremental markdown deltas for progressive section UI (document content only). */
  onDelta?: (chunk: string) => void;
  /** Fired once when the stream id is known (for abortChatStream + stale guards). */
  onStreamStart?: (streamId: string) => void;
  /**
   * Reasoning activity only — never document content.
   * Callers must not append this into accumulated markdown / plan / sections.
   */
  onReasoningActivity?: () => void;
  /** 0 = first live attempt, 1 = retry before first token. */
  retryAttempt?: number;
}): Promise<
  | { ok: true; text: string; resolvedModel?: string; deltaChars: number }
  | { ok: false; error: string; aborted?: boolean; deltaChars: number; partialText?: string }
> {
  const caval = (window as unknown as {
    caval?: {
      chatStream?: (
        request: {
          message: string;
          model: string;
          mode?: string;
          intent?: import('../types').RoutingIntent;
          streamId: string;
          workspaceRoot?: string;
          jsonMode?: boolean;
          maxTokens?: number;
          temperature?: number;
          timeoutMs?: number;
          messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
        },
        onChunk: (chunk: CavalStreamChunk) => void
      ) => () => void;
      abortChatStream?: (streamId: string) => void | Promise<unknown>;
    };
  }).caval;

  if (!caval?.chatStream) {
    return { ok: false, error: 'Pipeline AI indisponibil (chatStream).', deltaChars: 0 };
  }

  const userMessage =
    [...params.messages].reverse().find((m) => m.role === 'user')?.content?.trim() ?? '';

  if (!userMessage) {
    return { ok: false, error: 'Mesaj utilizator lipsă.', deltaChars: 0 };
  }

  // Abort already produced before subscribe — never leave a pending promise.
  if (params.signal?.aborted) {
    return { ok: false, error: 'Generare anulată.', aborted: true, deltaChars: 0 };
  }

  return new Promise((resolve) => {
    const streamId = generateStreamId();
    const streamStartMs = Date.now();
    let firstDeltaMs: number | undefined;
    let lastDeltaMs: number | undefined;
    let buffer = '';
    let resolvedModel: string | undefined;
    let settled = false;
    const cleanupHolder: { fn?: () => void } = {};

    const telemetry = (extra: Record<string, unknown>) => {
      console.info(
        '[robotics] turn',
        JSON.stringify({
          request_id: streamId,
          model: params.model,
          mode: 'ask',
          intent: params.intent ?? 'planning',
          stream_start: streamStartMs,
          first_delta: firstDeltaMs ?? null,
          ttft_ms: firstDeltaMs != null ? firstDeltaMs - streamStartMs : null,
          last_delta: lastDeltaMs ?? null,
          retry_attempt: params.retryAttempt ?? 0,
          ...extra,
        })
      );
    };

    const finish = (
      result:
        | { ok: true; text: string; resolvedModel?: string; deltaChars: number }
        | { ok: false; error: string; aborted?: boolean; deltaChars: number; partialText?: string }
    ) => {
      if (settled) return;
      settled = true;
      cleanupHolder.fn?.();
      params.signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };

    const onAbort = () => {
      // Best-effort, once per streamId — main cancel is P2.
      issueAbortChatStreamOnce(streamId);
      telemetry({ fallback_reason: 'aborted', watchdog_reason: null });
      finish({ ok: false, error: 'Generare anulată.', aborted: true, deltaChars: buffer.length });
    };

    // Attach listener first, then check aborted (race with pre-aborted signal).
    params.signal?.addEventListener('abort', onAbort, { once: true });
    if (params.signal?.aborted) {
      onAbort();
      return;
    }

    params.onStreamStart?.(streamId);
    telemetry({ event: 'stream_start' });
    if (params.signal?.aborted) {
      onAbort();
      return;
    }

    cleanupHolder.fn = caval.chatStream!(
      {
        message: userMessage,
        model: params.model,
        mode: 'ask',
        streamId,
        workspaceRoot: params.workspaceRoot ?? undefined,
        intent: params.intent ?? 'planning',
        messages: params.messages,
        jsonMode: false,
        maxTokens: params.maxTokens ?? 16_384,
        temperature: 0.2,
        timeoutMs: 180_000,
      },
      (chunk: CavalStreamChunk) => {
        if (params.signal?.aborted) {
          onAbort();
          return;
        }
        if (chunk.type === 'meta' && chunk.resolvedModel) {
          resolvedModel = chunk.resolvedModel;
        }
        // Reasoning never enters the Robotics document buffer.
        if (chunk.type === 'reasoning' && chunk.reasoningDelta) {
          params.onReasoningActivity?.();
        }
        if (chunk.type === 'delta' && chunk.delta) {
          const now = Date.now();
          if (firstDeltaMs == null) firstDeltaMs = now;
          lastDeltaMs = now;
          buffer += chunk.delta;
          params.onDelta?.(chunk.delta);
        }
        if (chunk.type === 'error') {
          const watchdog =
            chunk.timedOut || chunk.code === 'turn_watchdog_timeout' ? 'watchdog' : null;
          telemetry({
            event: 'stream_error',
            fallback_reason: chunk.error ?? 'unknown',
            watchdog_reason: watchdog,
          });
          finish({
            ok: false,
            error: chunk.error ?? 'Eroare necunoscută',
            deltaChars: buffer.length,
            partialText: buffer,
          });
        }
        if (chunk.type === 'done') {
          // Prefer live deltas; if the provider only delivered the final body
          // (composeText / no incremental chunks), still accept the document.
          const finalText =
            buffer.trim().length > 0
              ? buffer
              : (typeof chunk.composeText === 'string' ? chunk.composeText : '') || buffer;
          if (finalText && !buffer.trim() && params.onDelta) {
            const now = Date.now();
            if (firstDeltaMs == null) firstDeltaMs = now;
            lastDeltaMs = now;
            params.onDelta(finalText);
          }
          telemetry({ event: 'stream_done', fallback_reason: null, watchdog_reason: null });
          finish({
            ok: true,
            text: finalText,
            resolvedModel: chunk.model ?? resolvedModel,
            deltaChars: finalText.length,
          });
        }
      }
    );

    if (!cleanupHolder.fn) {
      params.signal?.removeEventListener('abort', onAbort);
      finish({ ok: false, error: 'IPC streaming indisponibil.', deltaChars: 0 });
    }
  });
}

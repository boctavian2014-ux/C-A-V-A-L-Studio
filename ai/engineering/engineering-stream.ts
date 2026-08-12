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
  /** Incremental markdown deltas for progressive section UI (document content only). */
  onDelta?: (chunk: string) => void;
  /** Fired once when the stream id is known (for abortChatStream + stale guards). */
  onStreamStart?: (streamId: string) => void;
  /**
   * Reasoning activity only — never document content.
   * Callers must not append this into accumulated markdown / plan / sections.
   */
  onReasoningActivity?: () => void;
}): Promise<
  | { ok: true; text: string; resolvedModel?: string; deltaChars: number }
  | { ok: false; error: string; aborted?: boolean }
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
    return { ok: false, error: 'Pipeline AI indisponibil (chatStream).' };
  }

  const userMessage =
    [...params.messages].reverse().find((m) => m.role === 'user')?.content?.trim() ?? '';

  if (!userMessage) {
    return { ok: false, error: 'Mesaj utilizator lipsă.' };
  }

  // Abort already produced before subscribe — never leave a pending promise.
  if (params.signal?.aborted) {
    return { ok: false, error: 'Generare anulată.', aborted: true };
  }

  return new Promise((resolve) => {
    const streamId = generateStreamId();
    let buffer = '';
    let resolvedModel: string | undefined;
    let settled = false;
    const cleanupHolder: { fn?: () => void } = {};

    const finish = (
      result:
        | { ok: true; text: string; resolvedModel?: string; deltaChars: number }
        | { ok: false; error: string; aborted?: boolean }
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
      finish({ ok: false, error: 'Generare anulată.', aborted: true });
    };

    // Attach listener first, then check aborted (race with pre-aborted signal).
    params.signal?.addEventListener('abort', onAbort, { once: true });
    if (params.signal?.aborted) {
      onAbort();
      return;
    }

    params.onStreamStart?.(streamId);
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
        intent: 'deep_thinking',
        messages: params.messages,
        jsonMode: false,
        maxTokens: 16_384,
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
          buffer += chunk.delta;
          params.onDelta?.(chunk.delta);
        }
        if (chunk.type === 'error') {
          finish({ ok: false, error: chunk.error ?? 'Eroare necunoscută' });
        }
        if (chunk.type === 'done') {
          // Delta channel is the sole source for final markdown document.
          finish({
            ok: true,
            text: buffer,
            resolvedModel: chunk.model ?? resolvedModel,
            deltaChars: buffer.length,
          });
        }
      }
    );

    if (!cleanupHolder.fn) {
      params.signal?.removeEventListener('abort', onAbort);
      finish({ ok: false, error: 'IPC streaming indisponibil.' });
    }
  });
}

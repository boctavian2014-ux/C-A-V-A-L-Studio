import type { CavalStreamChunk } from '../../src/main/preload';
import type { ModelSelectionId } from '../models/model-catalog';
import { pickBestRoboticsMarkdown } from './robotics-format';

function generateStreamId(): string {
  return `eng-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function completeViaChatStream(params: {
  model: ModelSelectionId;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  workspaceRoot?: string | null;
  signal?: AbortSignal;
}): Promise<
  | { ok: true; text: string; resolvedModel?: string }
  | { ok: false; error: string }
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

  if (params.signal?.aborted) {
    return { ok: false, error: 'Generare anulată.' };
  }

  return new Promise((resolve) => {
    const streamId = generateStreamId();
    let buffer = '';
    let reasoningBuffer = '';
    let resolvedModel: string | undefined;
    let settled = false;

    const finish = (
      result:
        | { ok: true; text: string; resolvedModel?: string }
        | { ok: false; error: string }
    ) => {
      if (settled) return;
      settled = true;
      cleanup?.();
      resolve(result);
    };

    const onAbort = () => {
      finish({ ok: false, error: 'Generare anulată.' });
    };

    params.signal?.addEventListener('abort', onAbort, { once: true });

    const cleanup = caval.chatStream!(
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
        if (chunk.type === 'reasoning' && chunk.reasoningDelta) {
          reasoningBuffer += chunk.reasoningDelta;
        }
        if (chunk.type === 'delta' && chunk.delta) {
          buffer += chunk.delta;
        }
        if (chunk.type === 'error') {
          finish({ ok: false, error: chunk.error ?? 'Eroare necunoscută' });
        }
        if (chunk.type === 'done') {
          const text = pickBestRoboticsMarkdown(buffer, reasoningBuffer);
          finish({
            ok: true,
            text,
            resolvedModel: chunk.model ?? resolvedModel,
          });
        }
      }
    );

    if (!cleanup) {
      params.signal?.removeEventListener('abort', onAbort);
      finish({ ok: false, error: 'IPC streaming indisponibil.' });
    }
  });
}

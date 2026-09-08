import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createRoboticsStreamHttpObserver,
  isRoboticsStreamHttpEnabled,
} from '../../ai/engineering/robotics-stream-http-telemetry';
import { OpenRouterProvider } from '../../ai/providers/openrouter';
import type { ModelDescriptor, ModelRequest } from '../../ai/types';

function sseBody(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = events.join('\n') + '\n';
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

function abortableHangBody(signal: AbortSignal | undefined): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const fail = () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        try {
          controller.error(err);
        } catch {
          /* already closed */
        }
      };
      if (signal?.aborted) {
        fail();
        return;
      }
      signal?.addEventListener('abort', fail, { once: true });
    },
  });
}

const model: ModelDescriptor = {
  id: 'stepfun-step-3-7-flash',
  displayName: 'StepFun Flash',
  provider: 'openrouter',
  capabilities: ['chat'],
  priority: 1,
  contextWindow: 128000,
  supportsStreaming: true,
  supportsToolCalling: false,
  preferredIntents: ['planning'],
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  providerModelId: 'stepfun/step-3.7-flash',
};

function roboticsRequest(requestId: string): ModelRequest {
  return {
    prompt: 'hi',
    capability: 'chat',
    intent: 'planning',
    stream: true,
    metadata: {
      requestId,
      parentTurnId: 'eng-parent-1',
      retryAttempt: 0,
      chatMode: 'ask',
    },
    messages: [{ role: 'user', content: 'hi' }],
  };
}

describe('robotics stream HTTP telemetry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('enables only eng-* request ids', () => {
    expect(isRoboticsStreamHttpEnabled('eng-1-abc')).toBe(true);
    expect(isRoboticsStreamHttpEnabled('chat-1')).toBe(false);
    expect(isRoboticsStreamHttpEnabled(undefined)).toBe(false);
  });

  it('does not log for non-robotics request ids', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const obs = createRoboticsStreamHttpObserver({ requestId: 'arena-1' });
    obs.httpStart();
    obs.httpHeaders({ status: 200 });
    expect(info).not.toHaveBeenCalled();
  });

  it('emits redacted start/headers without prompt or keys', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const obs = createRoboticsStreamHttpObserver({
      requestId: 'eng-1-abc',
      parentTurnId: 'eng-1-abc',
      retryAttempt: 1,
      provider: 'openrouter',
      model: 'stepfun-step-3-7-flash',
      mode: 'ask',
      intent: 'planning',
    });
    obs.httpStart();
    obs.httpHeaders({
      status: 200,
      content_type: 'text/event-stream',
      content_encoding: null,
      transfer_encoding: 'chunked',
    });
    const payloads = info.mock.calls.map((args) => String(args[1] ?? ''));
    expect(payloads.join('\n')).not.toMatch(/sk-or-|Bearer|piuli/i);
    const start = JSON.parse(payloads[0]!);
    expect(start.event).toBe('robotics_stream_http_start');
    expect(start.request_id).toBe('eng-1-abc');
    expect(start.retry_attempt).toBe(1);
    expect(start.stream).toBe(true);
    const headers = JSON.parse(payloads[1]!);
    expect(headers.event).toBe('robotics_stream_http_headers');
    expect(headers.http_status).toBe(200);
    expect(headers.content_type).toBe('text/event-stream');
  });

  it('logs first_byte, first_sse_event, first_content_delta on OpenAI-compatible SSE', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          sseBody([
            'data: {"choices":[{"delta":{"role":"assistant"}}]}',
            'data: {"choices":[{"delta":{"content":"ok"}}]}',
            'data: [DONE]',
          ]),
          {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          }
        )
      )
    );

    const provider = new OpenRouterProvider();
    const chunks: string[] = [];
    for await (const chunk of provider.stream(roboticsRequest('eng-obs-1'), model)) {
      if (chunk.kind === 'content') chunks.push(chunk.text);
    }

    expect(chunks.join('')).toBe('ok');
    const events = info.mock.calls
      .filter((args) => String(args[0]).startsWith('[robotics]'))
      .map((args) => JSON.parse(String(args[1])).event);
    expect(events).toEqual([
      'robotics_stream_http_start',
      'robotics_stream_http_headers',
      'robotics_stream_first_byte',
      'robotics_stream_first_sse_event',
      'robotics_stream_first_content_delta',
      'robotics_stream_done',
    ]);
  });

  it('logs headers without first_byte when the body never yields', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const ac = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        new Response(abortableHangBody(init?.signal), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      )
    );

    const provider = new OpenRouterProvider();
    const consume = (async () => {
      for await (const _chunk of provider.stream(roboticsRequest('eng-hang-1'), model, {
        signal: ac.signal,
      })) {
        /* drain */
      }
    })();
    await new Promise((r) => setTimeout(r, 20));
    ac.abort();
    await consume;

    const events = info.mock.calls
      .filter((args) => String(args[0]).startsWith('[robotics]'))
      .map((args) => JSON.parse(String(args[1])).event);
    expect(events).toContain('robotics_stream_http_start');
    expect(events).toContain('robotics_stream_http_headers');
    expect(events).not.toContain('robotics_stream_first_byte');
    expect(events.at(-1)).toBe('robotics_stream_abort');
  });
});

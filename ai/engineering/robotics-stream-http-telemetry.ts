import { isRoboticsEngineeringStreamId } from '../../src/shared/turn-watchdog';

/** Redacted HTTP/SSE lifecycle for Robotics eng-* streams. Log-only — no routing/timeouts. */
export type RoboticsStreamHttpEvent =
  | 'robotics_stream_http_start'
  | 'robotics_stream_http_headers'
  | 'robotics_stream_first_byte'
  | 'robotics_stream_first_sse_event'
  | 'robotics_stream_first_content_delta'
  | 'robotics_stream_done'
  | 'robotics_stream_error'
  | 'robotics_stream_abort';

export type RoboticsStreamHttpContext = {
  requestId?: string;
  parentTurnId?: string;
  retryAttempt?: number;
  provider?: string;
  model?: string;
  mode?: string;
  intent?: string;
};

export type RoboticsStreamHttpHeaders = {
  status?: number;
  content_type?: string | null;
  content_encoding?: string | null;
  transfer_encoding?: string | null;
};

const SHORT: Record<RoboticsStreamHttpEvent, string> = {
  robotics_stream_http_start: 'http_start',
  robotics_stream_http_headers: 'http_headers',
  robotics_stream_first_byte: 'first_byte',
  robotics_stream_first_sse_event: 'first_sse_event',
  robotics_stream_first_content_delta: 'first_content_delta',
  robotics_stream_done: 'done',
  robotics_stream_error: 'error',
  robotics_stream_abort: 'abort',
};

export function isRoboticsStreamHttpEnabled(requestId: string | undefined): boolean {
  return isRoboticsEngineeringStreamId(requestId);
}

export function snapshotResponseHeaders(response: Response): RoboticsStreamHttpHeaders {
  return {
    status: response.status,
    content_type: response.headers.get('content-type'),
    content_encoding: response.headers.get('content-encoding'),
    transfer_encoding: response.headers.get('transfer-encoding'),
  };
}

export function createRoboticsStreamHttpObserver(ctx: RoboticsStreamHttpContext) {
  const enabled = isRoboticsStreamHttpEnabled(ctx.requestId);
  const startedAt = performance.now();
  const startedAtMs = Date.now();
  let firstByteLogged = false;
  let firstEventLogged = false;
  let firstContentLogged = false;
  let terminalLogged = false;

  const base = (): Record<string, unknown> => ({
    request_id: ctx.requestId ?? null,
    parent_turn_id: ctx.parentTurnId ?? ctx.requestId ?? null,
    retry_attempt: ctx.retryAttempt ?? 0,
    elapsed_ms: Math.round(performance.now() - startedAt),
  });

  const emit = (event: RoboticsStreamHttpEvent, extra: Record<string, unknown> = {}) => {
    if (!enabled) return;
    console.info(
      `[robotics] ${SHORT[event]}`,
      JSON.stringify({
        event,
        ...base(),
        ...extra,
      })
    );
  };

  return {
    enabled,
    httpStart(): void {
      emit('robotics_stream_http_start', {
        provider: ctx.provider ?? null,
        model: ctx.model ?? null,
        mode: ctx.mode ?? null,
        intent: ctx.intent ?? null,
        stream: true,
        started_at_ms: startedAtMs,
      });
    },
    httpHeaders(headers: RoboticsStreamHttpHeaders): void {
      emit('robotics_stream_http_headers', {
        http_status: headers.status ?? null,
        content_type: headers.content_type ?? null,
        content_encoding: headers.content_encoding ?? null,
        transfer_encoding: headers.transfer_encoding ?? null,
      });
    },
    firstByte(bytes: number): void {
      if (firstByteLogged) return;
      firstByteLogged = true;
      emit('robotics_stream_first_byte', { bytes });
    },
    firstSseEvent(eventType: string, extra: Record<string, unknown> = {}): void {
      if (firstEventLogged) return;
      firstEventLogged = true;
      emit('robotics_stream_first_sse_event', {
        sse_event: eventType,
        ...extra,
      });
    },
    firstContentDelta(chars: number): void {
      if (firstContentLogged) return;
      firstContentLogged = true;
      emit('robotics_stream_first_content_delta', { chars });
    },
    done(): void {
      if (terminalLogged) return;
      terminalLogged = true;
      emit('robotics_stream_done', {
        saw_first_byte: firstByteLogged,
        saw_first_sse_event: firstEventLogged,
        saw_first_content_delta: firstContentLogged,
      });
    },
    error(fields: { error_code: string; error_name: string; http_status?: number }): void {
      if (terminalLogged) return;
      terminalLogged = true;
      emit('robotics_stream_error', {
        error_code: fields.error_code,
        error_name: fields.error_name,
        http_status: fields.http_status ?? null,
        saw_first_byte: firstByteLogged,
        saw_first_sse_event: firstEventLogged,
        saw_first_content_delta: firstContentLogged,
      });
    },
    abort(fields: { error_code?: string; error_name?: string } = {}): void {
      if (terminalLogged) return;
      terminalLogged = true;
      emit('robotics_stream_abort', {
        error_code: fields.error_code ?? 'aborted',
        error_name: fields.error_name ?? 'AbortError',
        saw_first_byte: firstByteLogged,
        saw_first_sse_event: firstEventLogged,
        saw_first_content_delta: firstContentLogged,
      });
    },
  };
}

export type RoboticsStreamHttpObserver = ReturnType<typeof createRoboticsStreamHttpObserver>;

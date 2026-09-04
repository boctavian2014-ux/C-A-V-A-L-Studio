import type { ModelDescriptor, ModelProvider, ModelRequest, ModelResponse, ModelStreamChunk, ProviderRequestOptions } from "../types";
import { getProviderProfiles } from "../model-profiles";

function ollamaBaseUrl(endpoint: string): string {
  return endpoint.replace(/\/api\/chat\/?$/, "");
}

function buildMessages(request: ModelRequest): Array<{ role: string; content: string }> {
  if (request.messages?.length) {
    return request.messages.map((m) => ({ role: m.role, content: m.content }));
  }
  return [
    ...(request.system ? [{ role: "system", content: request.system }] : []),
    { role: "user", content: request.prompt },
  ];
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name) : "";
  return name === "AbortError";
}

function abortedError(): Error {
  const abortErr = new Error("Aborted");
  abortErr.name = "AbortError";
  return abortErr;
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    /* already closed or released */
  }
}

function releaseReaderLock(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  try {
    reader.releaseLock();
  } catch {
    /* already released */
  }
}

export class FallbackOpenSourceProvider implements ModelProvider {
  readonly name = "open_source";

  models(): ModelDescriptor[] {
    return getProviderProfiles("open_source");
  }

  async complete(request: ModelRequest, model: ModelDescriptor, options: ProviderRequestOptions = {}): Promise<ModelResponse> {
    const startedAt = Date.now();
    if (options.signal?.aborted) {
      throw abortedError();
    }
    let response: Response;
    try {
      response = await fetch(model.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: options.signal,
        body: JSON.stringify({
          model: model.id,
          stream: false,
          messages: buildMessages(request),
          options: {
            temperature: request.temperature ?? 0.2,
            num_predict: request.maxTokens,
          },
        }),
      });
    } catch (error) {
      if (options.signal?.aborted || isAbortError(error)) {
        throw abortedError();
      }
      throw error;
    }

    if (!response.ok) {
      throw new Error(`Ollama failed (${model.id}) HTTP ${response.status}: ${await response.text()}`);
    }

    const json = (await response.json()) as { message?: { content?: string } };
    return {
      model: model.id,
      provider: this.name,
      content: json.message?.content ?? "",
      latencyMs: Date.now() - startedAt,
    };
  }

  async *stream(request: ModelRequest, model: ModelDescriptor, options: ProviderRequestOptions = {}): AsyncIterable<ModelStreamChunk> {
    if (options.signal?.aborted) {
      return;
    }
    const url = `${ollamaBaseUrl(model.endpoint)}/api/chat`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: options.signal,
        body: JSON.stringify({
          model: model.id,
          stream: true,
          messages: buildMessages(request),
          options: {
            temperature: request.temperature ?? 0.2,
            num_predict: request.maxTokens,
          },
        }),
      });
    } catch (error) {
      if (options.signal?.aborted || isAbortError(error)) {
        return;
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Ollama indisponibil (${model.id}). Pornește Ollama (ollama serve) și rulează: ollama pull ${model.id}. Detaliu: ${msg}`
      );
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama failed (${model.id}) HTTP ${response.status}: ${body}`);
    }

    if (!response.body) {
      throw new Error(`Ollama (${model.id}) returned empty stream body`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completedNormally = false;

    try {
      while (true) {
        if (options.signal?.aborted) {
          return;
        }
        let value: Uint8Array | undefined;
        let done = false;
        try {
          ({ value, done } = await reader.read());
        } catch (error) {
          if (options.signal?.aborted || isAbortError(error)) {
            return;
          }
          throw error;
        }
        if (done) {
          completedNormally = true;
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
            const delta = json.message?.content ?? "";
            if (delta) yield { kind: "content", text: delta };
          } catch {
            /* skip malformed line */
          }
        }
      }
    } finally {
      if (!completedNormally) {
        await cancelReader(reader);
      }
      releaseReaderLock(reader);
    }
  }
}

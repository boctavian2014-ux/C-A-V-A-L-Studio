import type { ModelDescriptor, ModelProvider, ModelRequest, ModelResponse, ProviderRequestOptions } from "../types";
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

export class FallbackOpenSourceProvider implements ModelProvider {
  readonly name = "open_source";

  models(): ModelDescriptor[] {
    return getProviderProfiles("open_source");
  }

  async complete(request: ModelRequest, model: ModelDescriptor, options: ProviderRequestOptions = {}): Promise<ModelResponse> {
    const startedAt = Date.now();
    const response = await fetch(model.endpoint, {
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

  async *stream(request: ModelRequest, model: ModelDescriptor, options: ProviderRequestOptions = {}): AsyncIterable<string> {
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

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
          const delta = json.message?.content ?? "";
          if (delta) yield delta;
        } catch {
          /* skip malformed line */
        }
      }
    }
  }
}

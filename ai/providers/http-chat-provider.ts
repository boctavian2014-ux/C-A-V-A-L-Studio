import { resolveProviderModelId } from "../models/provider-model-id";
import { extractReasoningFromDelta } from "./stream-reasoning";
import type {
  ChatMessage,
  ModelDescriptor,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  ProviderRequestOptions
} from "../types";
export interface HttpProviderConfig {
  name: string;
  apiKeyEnv: string;
  defaultHeaders?: Record<string, string>;
}

export abstract class HttpChatProvider implements ModelProvider {
  abstract readonly name: string;

  protected constructor(private readonly config: HttpProviderConfig) {}

  abstract models(): ModelDescriptor[];

  async complete(request: ModelRequest, model: ModelDescriptor, options: ProviderRequestOptions = {}): Promise<ModelResponse> {
    const startedAt = Date.now();
    const response = await fetch(model.endpoint, {
      method: "POST",
      headers: this.headers(),
      signal: options.signal,
      body: JSON.stringify(this.payload(request, model, false))
    });

    if (!response.ok) {
      throw new Error(`${this.name} failed with ${response.status}: ${await response.text()}`);
    }

    const json = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            function: {
              name: string;
              arguments: string;
            };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const message = json.choices?.[0]?.message;
    return {
      model: model.id,
      provider: this.name,
      content: message?.content ?? "",
      toolCalls: message?.tool_calls?.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: this.parseToolArguments(toolCall.function.arguments)
      })),
      latencyMs: Date.now() - startedAt,
      usage: {
        inputTokens: json.usage?.prompt_tokens,
        outputTokens: json.usage?.completion_tokens,
        totalTokens: json.usage?.total_tokens
      }
    };
  }

  async *stream(request: ModelRequest, model: ModelDescriptor, options: ProviderRequestOptions = {}): AsyncIterable<ModelStreamChunk> {
    const response = await fetch(model.endpoint, {
      method: "POST",
      headers: this.headers(),
      signal: options.signal,
      body: JSON.stringify(this.payload(request, model, true))
    });

    if (!response.ok || !response.body) {
      throw new Error(`${this.name} streaming failed with ${response.status}: ${await response.text()}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          continue;
        }
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{
              delta?: Record<string, unknown>;
              message?: { content?: string };
            }>;
          };
          const deltaObj = json.choices?.[0]?.delta;
          const reasoning = extractReasoningFromDelta(deltaObj);
          if (reasoning) {
            yield { kind: "reasoning", text: reasoning };
          }
          const content =
            (typeof deltaObj?.content === "string" ? deltaObj.content : undefined) ??
            json.choices?.[0]?.message?.content;
          if (content) {
            yield { kind: "content", text: content };
          }
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }
  }

  protected payload(request: ModelRequest, model: ModelDescriptor, stream: boolean): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      model: resolveProviderModelId(model),
      messages: this.serializeMessages(this.messages(request)),
      stream,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 2048,
      tools: request.tools?.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
    };
    if (request.metadata?.responseFormat === "json_object") {
      payload.response_format = { type: "json_object" };
    }
    return payload;
  }

  private messages(request: ModelRequest): ChatMessage[] {
    if (request.messages && request.messages.length > 0) {
      return request.messages;
    }

    return [
      ...(request.system ? [{ role: "system" as const, content: request.system }] : []),
      { role: "user" as const, content: request.prompt }
    ];
  }

  protected serializeMessages(messages: ChatMessage[]): Record<string, unknown>[] {
    return messages.map((message) => {
      const payload: Record<string, unknown> = {
        role: message.role,
        content: message.content || null,
      };
      if (message.name) payload.name = message.name;
      if (message.tool_call_id) payload.tool_call_id = message.tool_call_id;
      if (message.tool_calls) payload.tool_calls = message.tool_calls;
      return payload;
    });
  }

  private headers(): Record<string, string> {
    const apiKey = process.env[this.config.apiKeyEnv];
    return {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      ...this.config.defaultHeaders
    };
  }

  private parseToolArguments(value: string): Record<string, unknown> {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return { raw: value };
    }
  }
}

import type {
  ChatMessage,
  ModelDescriptor,
  ModelProvider,
  ModelRequest,
  ModelResponse,
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

  async *stream(request: ModelRequest, model: ModelDescriptor, options: ProviderRequestOptions = {}): AsyncIterable<string> {
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

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      yield decoder.decode(value, { stream: true });
    }
  }

  protected payload(request: ModelRequest, model: ModelDescriptor, stream: boolean): Record<string, unknown> {
    return {
      model: model.id,
      messages: this.messages(request),
      stream,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens,
      tools: request.tools?.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }))
    };
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

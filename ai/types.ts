export type ModelCapability =
  | "chat"
  | "code"
  | "reasoning"
  | "planning"
  | "patching"
  | "embeddings"
  | "tool_use"
  | "debug"
  | "autocomplete"
  | "documentation";

export type RoutingIntent =
  | "kilocode"
  | "multi_file"
  | "codebase"
  | "agent"
  | "tool_use"
  | "planning"
  | "reasoning"
  | "deep_thinking"
  | "debug"
  | "analysis"
  | "autocomplete"
  | "fast"
  | "documentation"
  | "fallback";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ModelRequest {
  prompt: string;
  system?: string;
  messages?: ChatMessage[];
  capability: ModelCapability;
  intent?: RoutingIntent;
  context?: Record<string, unknown>;
  tools?: ToolDefinition[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  metadata?: {
    workspaceRoot?: string;
    requestId?: string;
    userTier?: "community" | "pro" | "team" | "enterprise";
    preferredModel?: string;
    resolvedModel?: string;
    selectionId?: string;
    responseFormat?: "json_object";
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ModelResponse {
  model: string;
  provider: string;
  content: string;
  toolCalls?: ToolCall[];
  latencyMs?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface ModelDescriptor {
  id: string;
  displayName: string;
  provider: string;
  capabilities: ModelCapability[];
  priority: number;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  preferredIntents: RoutingIntent[];
  endpoint: string;
  /** Provider API slug when it differs from internal id (e.g. OpenRouter stepfun/step-3.7-flash) */
  providerModelId?: string;
}

export interface ProviderRequestOptions {
  signal?: AbortSignal;
}

/** Streaming event from model providers (content or reasoning tokens). */
export interface ModelStreamChunk {
  kind: "content" | "reasoning";
  text: string;
}

export interface ModelProvider {
  name: string;
  models(): ModelDescriptor[];
  complete(request: ModelRequest, model: ModelDescriptor, options?: ProviderRequestOptions): Promise<ModelResponse>;
  stream?(request: ModelRequest, model: ModelDescriptor, options?: ProviderRequestOptions): AsyncIterable<ModelStreamChunk>;
}

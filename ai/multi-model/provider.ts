// ──────────────────────────────────────────────
//  Caval AI — Provider abstraction
//  Interfață unică pentru Claude, GPT-4o, Gemini, Ollama local
// ──────────────────────────────────────────────

export type ModelId =
  | 'claude-opus-4'
  | 'claude-sonnet-4'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'
  | 'ollama-local';

export interface ModelMeta {
  id: ModelId;
  label: string;
  provider: 'anthropic' | 'openai' | 'google' | 'ollama';
  contextWindow: number;   // tokens
  costPer1kIn: number;     // USD
  costPer1kOut: number;    // USD
  supportsVision: boolean;
  color: string;           // pentru badge UI
}

export const MODELS: ModelMeta[] = [
  {
    id: 'claude-opus-4',
    label: 'Claude Opus',
    provider: 'anthropic',
    contextWindow: 200_000,
    costPer1kIn: 0.015,
    costPer1kOut: 0.075,
    supportsVision: true,
    color: '#C678DD',
  },
  {
    id: 'claude-sonnet-4',
    label: 'Claude Sonnet',
    provider: 'anthropic',
    contextWindow: 200_000,
    costPer1kIn: 0.003,
    costPer1kOut: 0.015,
    supportsVision: true,
    color: '#C678DD',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128_000,
    costPer1kIn: 0.005,
    costPer1kOut: 0.015,
    supportsVision: true,
    color: '#2FBF71',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    provider: 'openai',
    contextWindow: 128_000,
    costPer1kIn: 0.00015,
    costPer1kOut: 0.0006,
    supportsVision: true,
    color: '#2FBF71',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'google',
    contextWindow: 1_000_000,
    costPer1kIn: 0.00125,
    costPer1kOut: 0.010,
    supportsVision: true,
    color: '#61AFEF',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'google',
    contextWindow: 1_000_000,
    costPer1kIn: 0.000075,
    costPer1kOut: 0.0003,
    supportsVision: true,
    color: '#61AFEF',
  },
  {
    id: 'ollama-local',
    label: 'Local (Ollama)',
    provider: 'ollama',
    contextWindow: 32_000,
    costPer1kIn: 0,
    costPer1kOut: 0,
    supportsVision: false,
    color: '#F59E0B',
  },
];

// ──────────────────────────────────────────────
//  Message types
// ──────────────────────────────────────────────

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  error?: string;
}

// ──────────────────────────────────────────────
//  Provider interface
// ──────────────────────────────────────────────

export interface AIProvider {
  streamChat(
    messages: AIMessage[],
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void>;
}

// ──────────────────────────────────────────────
//  Factory — returnează provider-ul corect
// ──────────────────────────────────────────────

export function createProvider(modelId: ModelId, apiKeys: ApiKeys): AIProvider {
  const meta = MODELS.find((m) => m.id === modelId)!;

  switch (meta.provider) {
    case 'anthropic': return new AnthropicProvider(modelId, apiKeys.anthropic ?? '');
    case 'openai':    return new OpenAIProvider(modelId, apiKeys.openai ?? '');
    case 'google':    return new GeminiProvider(modelId, apiKeys.google ?? '');
    case 'ollama':    return new OllamaProvider(apiKeys.ollamaModel ?? 'llama3.2');
    default:          throw new Error(`Provider necunoscut: ${meta.provider}`);
  }
}

export interface ApiKeys {
  anthropic?: string;
  openai?: string;
  google?: string;
  ollamaModel?: string;    // ex: "llama3.2", "codestral"
  ollamaBaseUrl?: string;  // default: http://localhost:11434
}

// ──────────────────────────────────────────────
//  Anthropic (Claude) — streaming
// ──────────────────────────────────────────────

class AnthropicProvider implements AIProvider {
  constructor(
    private readonly modelId: ModelId,
    private readonly apiKey: string
  ) {}

  async streamChat(
    messages: AIMessage[],
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const systemMsg = messages.find((m) => m.role === 'system');
    const chatMsgs  = messages.filter((m) => m.role !== 'system');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'interleaved-thinking-2025-05-14',
      },
      body: JSON.stringify({
        model: this.modelId === 'claude-opus-4' ? 'claude-opus-4-5' : 'claude-sonnet-4-5',
        max_tokens: 8096,
        system: systemMsg?.content ?? undefined,
        messages: chatMsgs.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      onChunk({ delta: '', done: true, error: `Anthropic error ${res.status}: ${err}` });
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const evt = JSON.parse(data);
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            onChunk({ delta: evt.delta.text, done: false });
          }
        } catch {}
      }
    }
    onChunk({ delta: '', done: true });
  }
}

// ──────────────────────────────────────────────
//  OpenAI (GPT-4o) — streaming
// ──────────────────────────────────────────────

class OpenAIProvider implements AIProvider {
  constructor(
    private readonly modelId: ModelId,
    private readonly apiKey: string
  ) {}

  async streamChat(
    messages: AIMessage[],
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const modelMap: Record<string, string> = {
      'gpt-4o': 'gpt-4o',
      'gpt-4o-mini': 'gpt-4o-mini',
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: modelMap[this.modelId] ?? 'gpt-4o',
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        max_tokens: 8096,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      onChunk({ delta: '', done: true, error: `OpenAI error ${res.status}: ${err}` });
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const evt = JSON.parse(data);
          const delta = evt.choices?.[0]?.delta?.content ?? '';
          if (delta) onChunk({ delta, done: false });
        } catch {}
      }
    }
    onChunk({ delta: '', done: true });
  }
}

// ──────────────────────────────────────────────
//  Google Gemini — streaming
// ──────────────────────────────────────────────

class GeminiProvider implements AIProvider {
  constructor(
    private readonly modelId: ModelId,
    private readonly apiKey: string
  ) {}

  async streamChat(
    messages: AIMessage[],
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const modelName = this.modelId === 'gemini-2.5-pro'
      ? 'gemini-2.5-pro'
      : 'gemini-2.5-flash';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    // Gemini folosește un format diferit pentru system instruction
    const systemMsg = messages.find((m) => m.role === 'system');
    const chatMsgs  = messages.filter((m) => m.role !== 'system');

    const contents = chatMsgs.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body: Record<string, unknown> = { contents };
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      onChunk({ delta: '', done: true, error: `Gemini error ${res.status}: ${err}` });
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        try {
          const evt = JSON.parse(data);
          const text = evt.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          if (text) onChunk({ delta: text, done: false });
        } catch {}
      }
    }
    onChunk({ delta: '', done: true });
  }
}

// ──────────────────────────────────────────────
//  Ollama local — streaming
// ──────────────────────────────────────────────

class OllamaProvider implements AIProvider {
  constructor(
    private readonly model: string,
    private readonly baseUrl: string = 'http://localhost:11434'
  ) {}

  async streamChat(
    messages: AIMessage[],
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    });

    if (!res.ok) {
      onChunk({ delta: '', done: true, error: `Ollama error ${res.status}` });
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const evt = JSON.parse(line);
          if (evt.message?.content) onChunk({ delta: evt.message.content, done: false });
          if (evt.done) onChunk({ delta: '', done: true });
        } catch {}
      }
    }
  }
}

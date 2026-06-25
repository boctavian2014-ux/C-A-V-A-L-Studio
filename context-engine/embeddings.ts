import crypto from "node:crypto";
import type { ContextChunk, EmbeddingRecord } from "./types";

export interface EmbeddingProvider {
  readonly model: string;
  embed(text: string): Promise<number[]>;
}

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly model = "caval-local-deterministic-v1";

  async embed(text: string): Promise<number[]> {
    const digest = crypto.createHash("sha256").update(text).digest();
    return Array.from({ length: 32 }, (_, index) => digest[index] / 255);
  }
}

/** OpenRouter embeddings when OPENROUTER_API_KEY is set */
export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  readonly model = "openai/text-embedding-3-small";

  async embed(text: string): Promise<number[]> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new DeterministicEmbeddingProvider().embed(text);
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({ model: this.model, input: text.slice(0, 8000) }),
      });
      clearTimeout(timeout);
      if (!res.ok) {
        return new DeterministicEmbeddingProvider().embed(text);
      }
      const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
      return json.data?.[0]?.embedding ?? new DeterministicEmbeddingProvider().embed(text);
    } catch {
      return new DeterministicEmbeddingProvider().embed(text);
    }
  }
}

export function createEmbeddingProvider(): EmbeddingProvider {
  if (process.env.OPENROUTER_API_KEY) {
    return new OpenRouterEmbeddingProvider();
  }
  return new DeterministicEmbeddingProvider();
}

export class EmbeddingService {
  constructor(private readonly provider: EmbeddingProvider = createEmbeddingProvider()) {}

  async embedChunks(chunks: ContextChunk[]): Promise<EmbeddingRecord[]> {
    return Promise.all(chunks.map(async (chunk) => ({
      chunkId: chunk.id,
      vector: await this.provider.embed(chunk.text),
      model: this.provider.model,
    })));
  }
}

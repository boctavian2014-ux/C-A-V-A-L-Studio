import { ModelRouter } from "./model-router";
import { SafetyGuard } from "./safety/guard";
import type { ModelRequest, ModelResponse, ModelStreamChunk } from "./types";

export class AIClient {
  constructor(
    private readonly router = new ModelRouter(),
    private readonly safety = new SafetyGuard()
  ) {}

  async complete(request: ModelRequest): Promise<ModelResponse> {
    this.safety.assertRequestAllowed(request);
    return this.router.complete(request);
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    this.safety.assertRequestAllowed({ ...request, stream: true });
    yield* this.router.stream({ ...request, stream: true });
  }

  rank(request: ModelRequest) {
    return this.router.rank(request);
  }
}

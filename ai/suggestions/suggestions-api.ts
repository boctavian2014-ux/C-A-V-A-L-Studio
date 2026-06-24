import { ContextExpander } from "../composer/context/context-expander";
import { ContextMerger } from "../composer/context/context-merger";
import { ContextReducer } from "../composer/context/context-reducer";
import { SuggestionsGenerator } from "./suggestions-generator";
import { suggestionsStore } from "./suggestions-store";
import type { SuggestionsApprovalInput, SuggestionsBundle } from "./types";

export class SuggestionsApi {
  constructor(
    private readonly generator = new SuggestionsGenerator(),
    private readonly store = suggestionsStore,
    private readonly context = {
      expander: new ContextExpander(),
      reducer: new ContextReducer(),
      merger: new ContextMerger()
    }
  ) {}

  async submitRequest(request: string, workspaceRoot: string): Promise<SuggestionsBundle> {
    const expanded = await this.context.expander.expand(request, workspaceRoot);
    const reduced = this.context.reducer.reduce(expanded);
    const merged = this.context.merger.merge(reduced);
    const bundle = await this.generator.generate({
      request,
      workspaceRoot,
      context: merged
    });
    this.store.setBundle(bundle);
    return bundle;
  }

  getCurrent(): SuggestionsBundle | null {
    return this.store.current;
  }

  approve(input: SuggestionsApprovalInput): SuggestionsBundle | null {
    return this.store.approve(input);
  }

  reject(sessionId: string, notes?: string): SuggestionsBundle | null {
    return this.store.reject(sessionId, notes);
  }

  async proceedToComposer(sessionId: string): Promise<SuggestionsBundle | null> {
    return this.store.proceed(sessionId);
  }

  subscribe(listener: (bundle: SuggestionsBundle | null) => void): () => void {
    return this.store.subscribe(listener);
  }
}

export const suggestionsApi = new SuggestionsApi();

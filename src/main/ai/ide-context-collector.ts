import type { IdeContextPayload } from "../../shared/ai-context-contract";
import {
  appendIdeContextBlock,
  formatIdeContextForPrompt,
  validateAndBudgetIdeContext,
} from "../../shared/ai-context-prepare";

/**
 * Main boundary for Pas 5.2: never trust renderer shapes/sizes.
 * Workspace root is resolved from the bound workspace elsewhere — not from this payload.
 */
export function acceptIdeContextFromRenderer(raw: unknown): IdeContextPayload | undefined {
  return validateAndBudgetIdeContext(raw);
}

export function applyIdeContextToChatRequest<
  T extends {
    message: string;
    messages?: Array<{ role: string; content: string }>;
    ideContext?: IdeContextPayload;
  },
>(request: T, rawIdeContext: unknown): T {
  const ctx = acceptIdeContextFromRenderer(rawIdeContext);
  if (!ctx) {
    const { ideContext: _drop, ...rest } = request;
    void _drop;
    return rest as T;
  }

  const block = formatIdeContextForPrompt(ctx);
  const messages = request.messages?.map((m) => ({ ...m }));
  if (messages?.length && block) {
    const lastUserIdx = [...messages].reverse().findIndex((m) => m.role === "user");
    if (lastUserIdx >= 0) {
      const idx = messages.length - 1 - lastUserIdx;
      messages[idx] = {
        ...messages[idx]!,
        content: appendIdeContextBlock(messages[idx]!.content, block),
      };
    }
  }

  return {
    ...request,
    ideContext: ctx,
    message: appendIdeContextBlock(request.message, block),
    ...(messages ? { messages } : {}),
  };
}

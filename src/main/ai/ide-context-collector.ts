import type { IdeContextPayload } from "../../shared/ai-context-contract";
import {
  appendIdeContextBlock,
  formatIdeContextForPrompt,
  validateAndBudgetIdeContext,
} from "../../shared/ai-context-prepare";
import {
  buildEnhancedContext,
  formatEnhancedContextForPrompt,
} from "./enhanced-context";

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

/**
 * Pas 7d.3 — append workspace-search related files (read-only, redacted, capped).
 * Falls back to current-file-only / empty when the index is missing.
 */
export async function applyEnhancedContextToChatRequest<
  T extends {
    message: string;
    messages?: Array<{ role: string; content: string }>;
    ideContext?: IdeContextPayload;
  },
>(request: T, workspaceRoot: string | undefined): Promise<T> {
  const root = workspaceRoot?.trim();
  if (!root) return request;

  // Prefer the last user turn before any untrusted context blocks were appended.
  const lastUser =
    [...(request.messages ?? [])].reverse().find((m) => m.role === "user")?.content ??
    request.message ??
    "";
  const userMessage = lastUser
    .split(/<<IDE_CONTEXT|<<ENHANCED_CONTEXT/)[0]
    ?.trim() || lastUser.trim();

  const currentFile = request.ideContext?.activeFile?.path;
  const currentSelection = request.ideContext?.activeFile?.selection;

  const enhanced = await buildEnhancedContext(root, {
    userMessage,
    currentFile,
    currentSelection,
  });

  const block = formatEnhancedContextForPrompt(enhanced);
  if (!block.trim()) return request;

  const messages = request.messages?.map((m) => ({ ...m }));
  if (messages?.length) {
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
    message: appendIdeContextBlock(request.message, block),
    ...(messages ? { messages } : {}),
  };
}

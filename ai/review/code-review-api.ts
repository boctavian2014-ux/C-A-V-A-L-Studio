import { AIClient } from "../ai-client";
import { PatchValidator } from "../composer/patch/patch-validator";
import type { ComposerPatchSet } from "../composer/types";
import { codeReviewActions } from "./code-review-actions";
import { codeReviewStore } from "./code-review-store";
import { sessionToAcceptedPatchSet } from "./diff-parser";
import type { CodeReviewSession, ReviewComment, ReviewRevisionRequest, ReviewValidateResult } from "./types";

export class CodeReviewApi {
  constructor(
    private readonly store = codeReviewStore,
    readonly reviewActions = codeReviewActions,
    private readonly patchValidator = new PatchValidator(),
    private readonly ai = new AIClient()
  ) {}

  /** POST /api/review/patches */
  setPatches(workspaceRoot: string, patchSet: ComposerPatchSet): CodeReviewSession {
    return this.store.setPatches(patchSet, workspaceRoot);
  }

  getPatches(sessionId?: string): CodeReviewSession | null {
    const session = this.store.current;
    if (!session) return null;
    if (sessionId && session.id !== sessionId) return null;
    return session;
  }

  async revisePatches(request: ReviewRevisionRequest): Promise<ComposerPatchSet> {
    const session = this.store.current;
    if (!session || session.id !== request.sessionId) {
      return request.patches;
    }

    try {
      const response = await this.ai.complete({
        capability: "patching",
        intent: "multi_file",
        system: "Revise AI-generated patches based on user review comments. Return strict JSON ComposerPatchSet. Never apply directly.",
        prompt: [
          `Original summary: ${request.patches.summary}`,
          `Comments: ${JSON.stringify(request.comments)}`,
          `Patches: ${JSON.stringify(request.patches.files.map((f) => ({ path: f.path, patch: f.patch.slice(0, 2000) })))}`,
          'Return JSON: {"summary":"","files":[{"path":"","patch":"","semanticSummary":""}]}'
        ].join("\n"),
        metadata: { workspaceRoot: session.workspaceRoot }
      });
      const revised = JSON.parse(response.content) as ComposerPatchSet;
      this.store.setPatches(revised, session.workspaceRoot);
      return revised;
    } catch {
      return request.patches;
    }
  }

  /** POST /api/review/comments */
  saveComment(comment: Omit<ReviewComment, "id" | "createdAt">): ReviewComment | null {
    return this.store.addComment(comment);
  }

  getComments(sessionId?: string): ReviewComment[] {
    const session = this.store.current;
    if (!session) return [];
    if (sessionId && session.id !== sessionId) return [];
    return session.comments;
  }

  /** POST /api/review/validate */
  validate(sessionId?: string): ReviewValidateResult {
    const session = this.store.current;
    if (!session || (sessionId && session.id !== sessionId)) {
      return { ok: false, diagnostics: [{ level: "error", message: "No active review session" }] };
    }

    const patchSet = sessionToAcceptedPatchSet(session);
    const diagnostics = this.patchValidator.validate(session.workspaceRoot, patchSet).map((d) => ({
      level: d.level,
      message: d.message,
      file: d.file
    }));

    return {
      ok: !diagnostics.some((d) => d.level === "error"),
      diagnostics
    };
  }

  subscribe(listener: (session: CodeReviewSession | null) => void): () => void {
    return this.store.subscribe(listener);
  }
}

export const codeReviewApi = new CodeReviewApi();

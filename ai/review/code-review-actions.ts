import type { ComposerPatchSet } from "../composer/types";
import { codeReviewStore } from "./code-review-store";
import type { CodeReviewSession, ReviewComment } from "./types";

export class CodeReviewActions {
  constructor(private readonly store = codeReviewStore) {}

  acceptAll(): CodeReviewSession | null {
    return this.store.acceptAll();
  }

  rejectAll(): CodeReviewSession | null {
    return this.store.rejectAll();
  }

  acceptFile(fileId: string): void {
    this.store.acceptFile(fileId);
  }

  rejectFile(fileId: string): void {
    this.store.rejectFile(fileId);
  }

  acceptHunk(hunkId: string): void {
    this.store.acceptHunk(hunkId);
  }

  rejectHunk(hunkId: string): void {
    this.store.rejectHunk(hunkId);
  }

  acceptLine(lineId: string): void {
    this.store.acceptLine(lineId);
  }

  rejectLine(lineId: string): void {
    this.store.rejectLine(lineId);
  }

  async applySelected(): Promise<ComposerPatchSet | null> {
    return this.store.applySelected();
  }

  async askAIToRevise(): Promise<CodeReviewSession | null> {
    return this.store.askAIToRevise();
  }

  addComment(comment: Omit<ReviewComment, "id" | "createdAt">): ReviewComment | null {
    return this.store.addComment(comment);
  }
}

export const codeReviewActions = new CodeReviewActions();

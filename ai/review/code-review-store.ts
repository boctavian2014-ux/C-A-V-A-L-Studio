import { randomUUID } from "node:crypto";
import type { CodeReviewSession, ReviewComment, ReviewDecision } from "./types";
import { patchesToSession, sessionToAcceptedPatchSet } from "./diff-parser";
import type { ComposerPatchSet } from "../composer/types";

type ReviewListener = (session: CodeReviewSession | null) => void;

export class CodeReviewStore {
  private session: CodeReviewSession | null = null;
  private readonly listeners = new Set<ReviewListener>();
  onAcceptAll?: (patchSet: ComposerPatchSet) => void | Promise<void>;
  onApplySelected?: (patchSet: ComposerPatchSet) => void | Promise<void>;
  onAskAIToRevise?: (session: CodeReviewSession) => void | Promise<void>;

  get current(): CodeReviewSession | null {
    return this.session;
  }

  setSession(session: CodeReviewSession): void {
    this.session = session;
    this.emit();
  }

  clear(): void {
    this.session = null;
    this.emit();
  }

  subscribe(listener: ReviewListener): () => void {
    this.listeners.add(listener);
    listener(this.session);
    return () => this.listeners.delete(listener);
  }

  setPatches(patchSet: ComposerPatchSet, workspaceRoot: string): CodeReviewSession {
    const session = patchesToSession(workspaceRoot, patchSet);
    this.setSession(session);
    return session;
  }

  acceptAll(): CodeReviewSession | null {
    if (!this.session) return null;
    this.session = {
      ...this.session,
      status: "accepted",
      files: this.session.files.map((file) => ({
        ...file,
        decision: "accepted" as ReviewDecision,
        hunks: file.hunks.map((hunk) => ({
          ...hunk,
          decision: "accepted" as ReviewDecision,
          lines: hunk.lines.map((line) => ({ ...line, decision: "accepted" as ReviewDecision }))
        }))
      }))
    };
    this.emit();
    void this.onAcceptAll?.(sessionToAcceptedPatchSet(this.session));
    return this.session;
  }

  rejectAll(): CodeReviewSession | null {
    if (!this.session) return null;
    this.session = {
      ...this.session,
      status: "rejected",
      files: this.session.files.map((file) => ({
        ...file,
        decision: "rejected" as ReviewDecision,
        hunks: file.hunks.map((hunk) => ({
          ...hunk,
          decision: "rejected" as ReviewDecision,
          lines: hunk.lines.map((line) => ({ ...line, decision: "rejected" as ReviewDecision }))
        }))
      }))
    };
    this.emit();
    return this.session;
  }

  acceptFile(fileId: string): void {
    this.updateFile(fileId, "accepted");
  }

  rejectFile(fileId: string): void {
    this.updateFile(fileId, "rejected");
  }

  acceptHunk(hunkId: string): void {
    this.updateHunk(hunkId, "accepted");
  }

  rejectHunk(hunkId: string): void {
    this.updateHunk(hunkId, "rejected");
  }

  acceptLine(lineId: string): void {
    this.updateLine(lineId, "accepted");
  }

  rejectLine(lineId: string): void {
    this.updateLine(lineId, "rejected");
  }

  addComment(comment: Omit<ReviewComment, "id" | "createdAt">): ReviewComment | null {
    if (!this.session) return null;
    const entry: ReviewComment = {
      ...comment,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    };
    this.session = { ...this.session, comments: [...this.session.comments, entry] };
    this.emit();
    return entry;
  }

  async applySelected(): Promise<ComposerPatchSet | null> {
    if (!this.session) return null;
    const patchSet = sessionToAcceptedPatchSet(this.session);
    this.session = { ...this.session, status: "applied" };
    this.emit();
    await this.onApplySelected?.(patchSet);
    return patchSet;
  }

  async askAIToRevise(): Promise<CodeReviewSession | null> {
    if (!this.session) return null;
    this.session = { ...this.session, status: "revising" };
    this.emit();
    await this.onAskAIToRevise?.(this.session);
    return this.session;
  }

  private updateFile(fileId: string, decision: ReviewDecision): void {
    if (!this.session) return;
    this.session = {
      ...this.session,
      files: this.session.files.map((file) =>
        file.id === fileId
          ? {
              ...file,
              decision,
              hunks: file.hunks.map((hunk) => ({
                ...hunk,
                decision,
                lines: hunk.lines.map((line) => ({ ...line, decision }))
              }))
            }
          : file
      )
    };
    this.emit();
  }

  private updateHunk(hunkId: string, decision: ReviewDecision): void {
    if (!this.session) return;
    this.session = {
      ...this.session,
      files: this.session.files.map((file) => ({
        ...file,
        hunks: file.hunks.map((hunk) =>
          hunk.id === hunkId
            ? {
                ...hunk,
                decision,
                lines: hunk.lines.map((line) => ({ ...line, decision }))
              }
            : hunk
        )
      }))
    };
    this.emit();
  }

  private updateLine(lineId: string, decision: ReviewDecision): void {
    if (!this.session) return;
    this.session = {
      ...this.session,
      files: this.session.files.map((file) => ({
        ...file,
        hunks: file.hunks.map((hunk) => ({
          ...hunk,
          lines: hunk.lines.map((line) =>
            line.id === lineId ? { ...line, decision } : line
          )
        }))
      }))
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.session);
    }
  }
}

export const codeReviewStore = new CodeReviewStore();

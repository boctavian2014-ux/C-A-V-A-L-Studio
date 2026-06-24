import type { SuggestionsApprovalInput, SuggestionsBundle } from "./types";

type SuggestionsListener = (bundle: SuggestionsBundle | null) => void;

export class SuggestionsStore {
  private bundle: SuggestionsBundle | null = null;
  private readonly listeners = new Set<SuggestionsListener>();
  onProceedToComposer?: (bundle: SuggestionsBundle) => void | Promise<void>;

  get current(): SuggestionsBundle | null {
    return this.bundle;
  }

  setBundle(bundle: SuggestionsBundle): void {
    this.bundle = bundle;
    this.emit();
  }

  clear(): void {
    this.bundle = null;
    this.emit();
  }

  subscribe(listener: SuggestionsListener): () => void {
    this.listeners.add(listener);
    listener(this.bundle);
    return () => this.listeners.delete(listener);
  }

  approve(input: SuggestionsApprovalInput): SuggestionsBundle | null {
    if (!this.bundle || this.bundle.id !== input.sessionId) return null;
    this.bundle = {
      ...this.bundle,
      status: "approved",
      selectedAlternativeId: input.alternativeId ?? this.bundle.selectedAlternativeId ?? "alt-optimized",
      userNotes: input.notes
    };
    this.emit();
    return this.bundle;
  }

  reject(sessionId: string, notes?: string): SuggestionsBundle | null {
    if (!this.bundle || this.bundle.id !== sessionId) return null;
    this.bundle = { ...this.bundle, status: "rejected", userNotes: notes };
    this.emit();
    return this.bundle;
  }

  async proceed(sessionId: string): Promise<SuggestionsBundle | null> {
    if (!this.bundle || this.bundle.id !== sessionId) return null;
    if (this.bundle.status !== "approved") {
      this.bundle = {
        ...this.bundle,
        status: "approved",
        selectedAlternativeId: this.bundle.selectedAlternativeId ?? "alt-optimized"
      };
    }
    this.bundle = { ...this.bundle, status: "proceeded" };
    this.emit();
    await this.onProceedToComposer?.(this.bundle);
    return this.bundle;
  }

  isApproved(sessionId?: string): boolean {
    if (!this.bundle) return false;
    if (sessionId && this.bundle.id !== sessionId) return false;
    return this.bundle.status === "approved" || this.bundle.status === "proceeded";
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.bundle);
    }
  }
}

export const suggestionsStore = new SuggestionsStore();

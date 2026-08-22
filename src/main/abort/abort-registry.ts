import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import type { AbortHandle, AbortScope } from "../../shared/abort-contract";

interface AbortEntry {
  id: string;
  scope: AbortScope;
  parentId: string | null;
  controller: AbortController;
  children: Set<string>;
  reason?: string;
}

export class AbortRegistry extends EventEmitter {
  private readonly entries = new Map<string, AbortEntry>();

  create(scope: AbortScope, parentId?: string): AbortHandle {
    const id = randomUUID();
    const controller = new AbortController();
    const resolvedParent = parentId?.trim() ? parentId.trim() : null;

    const entry: AbortEntry = {
      id,
      scope,
      parentId: resolvedParent,
      controller,
      children: new Set(),
    };
    this.entries.set(id, entry);

    if (resolvedParent) {
      const parent = this.entries.get(resolvedParent);
      if (parent) {
        parent.children.add(id);
        if (parent.controller.signal.aborted) {
          this.abort(id, parent.reason);
        }
      }
    }

    return {
      id,
      scope,
      parentId: resolvedParent,
      signal: controller.signal,
      abort: (reason?: string) => {
        this.abort(id, reason);
      },
      get isAborted() {
        return controller.signal.aborted;
      },
    };
  }

  abort(id: string, reason?: string): void {
    const entry = this.entries.get(id);
    if (!entry || entry.controller.signal.aborted) {
      return;
    }

    entry.reason = reason;
    entry.controller.abort(reason);

    for (const childId of [...entry.children]) {
      this.abort(childId, reason);
    }

    this.emit("abort", id, entry.scope, reason);
  }

  isAborted(id: string): boolean {
    return this.entries.get(id)?.controller.signal.aborted ?? false;
  }

  getSignal(id: string): AbortSignal | undefined {
    return this.entries.get(id)?.controller.signal;
  }

  release(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.parentId) {
      this.entries.get(entry.parentId)?.children.delete(id);
    }
    this.entries.delete(id);
  }

  /** Drop this node and every descendant. Does not abort. */
  releaseTree(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const childId of [...entry.children]) {
      this.releaseTree(childId);
    }
    this.release(id);
  }

  /** @internal tests */
  size(): number {
    return this.entries.size;
  }

  onAbort(cb: (id: string, scope: AbortScope, reason?: string) => void): () => void {
    this.on("abort", cb);
    return () => {
      this.off("abort", cb);
    };
  }

  /** @internal tests */
  resetForTests(): void {
    this.entries.clear();
    this.removeAllListeners();
  }
}

export const abortRegistry = new AbortRegistry();

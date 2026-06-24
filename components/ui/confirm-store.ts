import type { PlanStep } from "../../ai/agent/types";

export type ConfirmResult = {
  confirmed: boolean;
  autoApply?: boolean;
};

export type ConfirmRequest = {
  id: string;
  title: string;
  message: string;
  step?: PlanStep | null;
  showAutoApply?: boolean;
  resolve: (result: ConfirmResult) => void;
};

type Listener = () => void;

let pending: ConfirmRequest | null = null;
const listeners = new Set<Listener>();

const notify = (): void => {
  for (const listener of Array.from(listeners)) {
    listener();
  }
};

export const confirmStore = {
  getPending(): ConfirmRequest | null {
    return pending;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  request(options: {
    title: string;
    message: string;
    step?: PlanStep | null;
    showAutoApply?: boolean;
  }): Promise<ConfirmResult> {
    return new Promise((resolve) => {
      pending = {
        id: `confirm-${Date.now()}`,
        title: options.title,
        message: options.message,
        step: options.step ?? null,
        showAutoApply: options.showAutoApply ?? Boolean(options.step),
        resolve
      };
      notify();
    });
  },

  respond(result: ConfirmResult): void {
    if (!pending) return;
    const current = pending;
    pending = null;
    notify();
    current.resolve(result);
  },

  cancel(): void {
    this.respond({ confirmed: false });
  }
};

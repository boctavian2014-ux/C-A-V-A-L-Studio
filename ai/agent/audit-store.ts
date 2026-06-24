import type { AgentAuditReport, HumanActionRequired } from "./types";

let currentAudit: AgentAuditReport | null = null;
const listeners = new Set<() => void>();

export const auditStore = {
  get(): AgentAuditReport | null {
    return currentAudit;
  },

  set(report: AgentAuditReport | null): void {
    currentAudit = report;
    for (const listener of Array.from(listeners)) {
      listener();
    }
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  recordHumanAction(action: HumanActionRequired): void {
    if (!currentAudit) return;
    const existing = currentAudit.humanActionsRequired.findIndex((a) => a.stepId === action.stepId);
    if (existing >= 0) {
      currentAudit.humanActionsRequired[existing] = action;
    } else {
      currentAudit.humanActionsRequired.push(action);
    }
    for (const listener of Array.from(listeners)) {
      listener();
    }
  }
};

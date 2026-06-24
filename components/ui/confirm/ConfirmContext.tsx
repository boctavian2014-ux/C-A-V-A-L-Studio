import { createContext, useCallback, useContext, type ReactNode } from "react";
import type { PlanStep } from "../../../ai/agent/types";
import { confirmStore } from "../confirm-store";

type ConfirmContextValue = {
  requestConfirm: (step: PlanStep) => Promise<{ confirmed: boolean; autoApply: boolean }>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const requestConfirm = useCallback(async (step: PlanStep) => {
    const result = await confirmStore.request({
      title: `Confirm: ${step.label}`,
      message: "This step requires confirmation before the agent proceeds.",
      step,
      showAutoApply: step.type === "compose"
    });
    return { confirmed: result.confirmed, autoApply: result.autoApply ?? false };
  }, []);

  return (
    <ConfirmContext.Provider value={{ requestConfirm }}>
      {children}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = (): ConfirmContextValue["requestConfirm"] => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside ConfirmProvider");
  }
  return ctx.requestConfirm;
};

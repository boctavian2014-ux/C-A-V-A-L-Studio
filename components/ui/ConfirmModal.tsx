import { Modal } from "./Modal";
import { Button } from "./Button";
import type { PlanStep } from "../../ai/agent/types";

interface Props {
  open: boolean;
  title: string;
  message?: string;
  step?: PlanStep | null;
  showAutoApply?: boolean;
  onConfirm: (autoApply?: boolean) => void;
  onCancel: () => void;
}

export const ConfirmModal = ({
  open,
  title,
  message,
  step,
  showAutoApply = true,
  onConfirm,
  onCancel
}: Props) => {
  if (!open) return null;

  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="text-sm text-[var(--pt-text-secondary)]">
        {message ?? "This step requires confirmation before the agent proceeds."}
      </div>

      {step?.meta && Object.keys(step.meta).length > 0 && (
        <pre className="mt-3 bg-[var(--pt-surface-3)] p-3 rounded text-xs text-[var(--pt-text-secondary)] overflow-auto max-h-40">
          {JSON.stringify(step.meta, null, 2)}
        </pre>
      )}

      <div className="mt-4 flex gap-2 justify-end flex-wrap">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        {showAutoApply && (
          <Button variant="ghost" size="sm" onClick={() => onConfirm(true)}>
            Confirm & Auto Apply
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={() => onConfirm(false)}>
          Confirm
        </Button>
      </div>
    </Modal>
  );
};

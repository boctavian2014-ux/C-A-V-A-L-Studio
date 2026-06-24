import { useEffect, type ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export const Modal = ({ open, onClose, title, children }: ModalProps) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="bg-[var(--pt-surface-2)] border border-[var(--pt-border)] rounded-xl p-6 w-full max-w-[480px] shadow-[var(--pt-shadow-strong)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pt-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="pt-modal-title" className="text-lg font-bold text-[var(--pt-text-primary)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--pt-text-secondary)] hover:text-[var(--pt-cyan)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./button";

export interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}

export const Modal = ({ open, title, children, onClose, footer }: ModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") trapFocus(event, dialogRef.current);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="caval-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section className="caval-modal" role="dialog" aria-modal="true" aria-labelledby="caval-modal-title" tabIndex={-1} ref={dialogRef} onMouseDown={(event) => event.stopPropagation()}>
        <header className="caval-modal__header">
          <h2 id="caval-modal-title">{title}</h2>
          <Button variant="ghost" iconOnly aria-label="Close modal" onClick={onClose}>Close</Button>
        </header>
        <div className="caval-modal__body">{children}</div>
        {footer && <footer className="caval-modal__footer">{footer}</footer>}
      </section>
    </div>
  );
};

const trapFocus = (event: KeyboardEvent, root: HTMLElement | null): void => {
  if (!root) return;
  const focusable = [...root.querySelectorAll<HTMLElement>("button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])")];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

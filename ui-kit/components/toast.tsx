import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "./badge";

export interface ToastProps {
  tone?: BadgeTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
}

export const Toast = ({ tone = "info", title, children, action, onDismiss }: ToastProps) => (
  <aside className={`caval-toast caval-toast--${tone}`} role="status" aria-live="polite">
    <div className="caval-toast__content">
      <Badge tone={tone}>{tone}</Badge>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
    {action && <div className="caval-toast__action">{action}</div>}
    {onDismiss && <button type="button" className="caval-toast__dismiss" aria-label="Dismiss notification" onClick={onDismiss}>x</button>}
  </aside>
);

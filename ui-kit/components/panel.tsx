import type { ReactNode } from "react";

export type PanelVariant = "ai" | "settings" | "marketplace" | "default";

export interface PanelProps {
  title?: string;
  variant?: PanelVariant;
  actions?: ReactNode;
  children: ReactNode;
}

export const Panel = ({ title, variant = "default", actions, children }: PanelProps) => (
  <section className={`caval-panel caval-panel--${variant}`}>
    {(title || actions) && (
      <header className="caval-panel__header">
        {title && <h2>{title}</h2>}
        {actions && <div className="caval-panel__actions">{actions}</div>}
      </header>
    )}
    <div className="caval-panel__body">{children}</div>
  </section>
);

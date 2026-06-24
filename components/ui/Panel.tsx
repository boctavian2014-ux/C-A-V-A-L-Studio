import type { HTMLAttributes, ReactNode } from "react";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  children: ReactNode;
}

export const Panel = ({ title, children, className = "", ...props }: PanelProps) => (
  <div
    className={`bg-[var(--pt-surface-2)] border border-[var(--pt-border)] rounded-xl p-6 shadow-[var(--pt-shadow-cyan)] ${className}`.trim()}
    {...props}
  >
    {title && (
      <h2 className="text-xl font-bold text-[var(--pt-text-primary)] mb-4">{title}</h2>
    )}
    {children}
  </div>
);

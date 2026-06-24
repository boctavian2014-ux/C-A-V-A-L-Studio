import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const Card = ({ children, className = "", ...props }: CardProps) => (
  <div
    className={`bg-[var(--pt-surface-2)] border border-[var(--pt-border)] rounded-lg p-4 shadow-[var(--pt-shadow-cyan)] transition-all hover:shadow-[var(--pt-shadow-strong)] ${className}`.trim()}
    {...props}
  >
    {children}
  </div>
);

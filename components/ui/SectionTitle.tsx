import type { HTMLAttributes, ReactNode } from "react";

export interface SectionTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode;
}

export const SectionTitle = ({ children, className = "", ...props }: SectionTitleProps) => (
  <h3
    className={`text-lg font-semibold text-[var(--pt-cyan)] mb-2 ${className}`.trim()}
    {...props}
  >
    {children}
  </h3>
);

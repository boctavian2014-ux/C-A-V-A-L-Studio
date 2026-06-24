import type { HTMLAttributes } from "react";

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {}

export const Divider = ({ className = "", ...props }: DividerProps) => (
  <div className={`border-b border-[var(--pt-border)] my-4 ${className}`.trim()} {...props} />
);

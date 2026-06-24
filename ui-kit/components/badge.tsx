import type { ReactNode } from "react";

export type BadgeTone = "info" | "success" | "warning" | "error" | "premium";

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

export const Badge = ({ tone = "info", children }: BadgeProps) => (
  <span className={`caval-badge caval-badge--${tone}`}>{children}</span>
);

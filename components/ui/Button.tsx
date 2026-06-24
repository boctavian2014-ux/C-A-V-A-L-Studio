import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const base =
  "rounded-md font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed";

const sizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-5 py-2.5 text-lg"
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--pt-cyan)] text-black shadow-[var(--pt-shadow-cyan)] hover:bg-[var(--pt-electric-blue)]",
  secondary:
    "bg-[var(--pt-surface-3)] text-[var(--pt-text-primary)] border border-[var(--pt-border)] hover:border-[var(--pt-cyan)] hover:text-[var(--pt-cyan)]",
  ghost:
    "bg-transparent text-[var(--pt-cyan)] border border-[var(--pt-cyan)] hover:bg-[var(--pt-cyan-soft)]"
};

export const Button = ({
  variant = "primary",
  size = "md",
  children,
  className = "",
  type = "button",
  ...props
}: ButtonProps) => (
  <button type={type} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`.trim()} {...props}>
    {children}
  </button>
);

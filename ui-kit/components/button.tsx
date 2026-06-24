import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconOnly?: boolean;
}

export const Button = ({ variant = "primary", size = "md", icon, iconOnly = false, className = "", children, ...props }: ButtonProps) => (
  <button
    type="button"
    className={`caval-button caval-button--${variant} caval-button--${size} ${iconOnly ? "caval-button--icon" : ""} ${className}`.trim()}
    aria-label={iconOnly && typeof children === "string" ? children : props["aria-label"]}
    {...props}
  >
    {icon && <span className="caval-button__icon" aria-hidden>{icon}</span>}
    {!iconOnly && children}
  </button>
);

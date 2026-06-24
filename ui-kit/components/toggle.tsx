import type { ButtonHTMLAttributes } from "react";

export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  checked: boolean;
  label?: string;
}

export const Toggle = ({ checked, label, className = "", ...props }: ToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    className={`caval-toggle ${checked ? "caval-toggle--checked" : ""} ${className}`.trim()}
    {...props}
  >
    <span className="caval-toggle__track"><span className="caval-toggle__thumb" /></span>
    {label && <span className="caval-toggle__label">{label}</span>}
  </button>
);

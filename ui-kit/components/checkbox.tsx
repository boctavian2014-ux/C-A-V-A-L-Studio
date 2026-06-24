import type { InputHTMLAttributes, ReactNode } from "react";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: ReactNode;
}

export const Checkbox = ({ label, className = "", ...props }: CheckboxProps) => (
  <label className={`caval-checkbox ${className}`.trim()}>
    <input type="checkbox" {...props} />
    <span className="caval-checkbox__box" aria-hidden />
    {label && <span className="caval-checkbox__label">{label}</span>}
  </label>
);

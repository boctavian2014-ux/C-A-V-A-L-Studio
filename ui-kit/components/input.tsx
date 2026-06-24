import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export type InputVariant = "text" | "password" | "search";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  variant?: InputVariant;
  error?: string;
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Input = ({ label, variant = "text", error, className = "", id, ...props }: InputProps) => {
  const inputId = id ?? props.name ?? `caval-input-${variant}`;
  return (
    <label className={`caval-field ${className}`.trim()} htmlFor={inputId}>
      {label && <span className="caval-field__label">{label}</span>}
      <input id={inputId} className="caval-input" type={variant === "search" ? "search" : variant} aria-invalid={Boolean(error)} {...props} />
      {error && <span className="caval-field__error">{error}</span>}
    </label>
  );
};

export const Textarea = ({ label, error, className = "", id, ...props }: TextareaProps) => {
  const textareaId = id ?? props.name ?? "caval-textarea";
  return (
    <label className={`caval-field ${className}`.trim()} htmlFor={textareaId}>
      {label && <span className="caval-field__label">{label}</span>}
      <textarea id={textareaId} className="caval-textarea" aria-invalid={Boolean(error)} {...props} />
      {error && <span className="caval-field__error">{error}</span>}
    </label>
  );
};

import { forwardRef, type InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, className = "", id, ...props }, ref) => {
    const inputId = id ?? (label ? `pt-input-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-[var(--pt-text-secondary)] text-sm">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`bg-[var(--pt-surface-3)] border border-[var(--pt-border)] rounded-md px-3 py-2 text-[var(--pt-text-primary)] focus:border-[var(--pt-cyan)] outline-none transition-all ${className}`.trim()}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = "Input";

import { useState, type ReactNode } from "react";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  delayMs?: number;
  placement?: "top" | "right" | "bottom" | "left";
}

export const Tooltip = ({ content, children, delayMs = 350, placement = "top" }: TooltipProps) => {
  const [open, setOpen] = useState(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const show = () => {
    timer = setTimeout(() => setOpen(true), delayMs);
  };
  const hide = () => {
    if (timer) clearTimeout(timer);
    setOpen(false);
  };

  return (
    <span className="caval-tooltip-anchor" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {open && <span role="tooltip" className={`caval-tooltip caval-tooltip--${placement}`}><span className="caval-tooltip__arrow" />{content}</span>}
    </span>
  );
};

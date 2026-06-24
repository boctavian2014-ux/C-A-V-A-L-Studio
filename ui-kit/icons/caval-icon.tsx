import type { SVGProps } from "react";

export const CavalIcon = ({ title = "Caval Studio", ...props }: SVGProps<SVGSVGElement> & { title?: string }) => (
  <svg viewBox="0 0 48 48" role="img" aria-label={title} {...props}>
    <title>{title}</title>
    <defs>
      <filter id="caval-cyan-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <rect x="9" y="4" width="30" height="40" rx="15" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.18" />
    <path d="M17 15v18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" opacity="0.58" />
    <path d="M24 10v28" stroke="#00E0FF" strokeWidth="2.8" strokeLinecap="round" filter="url(#caval-cyan-glow)" />
    <path d="M31 16v16" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" opacity="0.78" />
    <path d="M14 19c4-4.5 16-4.5 20 0" stroke="#D4A857" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.9" />
  </svg>
);

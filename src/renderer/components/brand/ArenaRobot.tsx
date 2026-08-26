import React from "react";

/** CAVAL arena mascot — brand proportions, independently posed parts for CSS motion. */
export function ArenaRobot({ size = 24 }: { size?: number }) {
  return (
    <svg
      data-testid="arena-status-robot"
      className="arena-robot"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="arena-robot-head-fill" x1="6" y1="4" x2="18" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5BA8FF" />
          <stop offset="0.45" stopColor="#2F7BFF" />
          <stop offset="1" stopColor="#1B4ED8" />
        </linearGradient>
        <linearGradient id="arena-robot-band-fill" x1="12" y1="6" x2="21" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#C084FC" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id="arena-robot-ear-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7EB6FF" />
          <stop offset="1" stopColor="#2B6FE8" />
        </linearGradient>
        <radialGradient id="arena-robot-visor-fill" cx="42%" cy="34%" r="72%">
          <stop offset="0" stopColor="#2A2D3A" />
          <stop offset="0.55" stopColor="#0C0D14" />
          <stop offset="1" stopColor="#05060A" />
        </radialGradient>
      </defs>

      <g className="arena-robot-pose">
        <g className="arena-robot-antenna">
          <path d="M12.1 4.6 L13.35 1.55" stroke="#3B82F6" strokeWidth="1.15" strokeLinecap="round" />
          <circle cx="13.55" cy="1.35" r="1.12" fill="#00E0FF" />
          <circle cx="13.3" cy="1.12" r="0.38" fill="#E9FFFF" />
        </g>

        <g className="arena-robot-head">
          <ellipse cx="12" cy="13.15" rx="7.55" ry="8.05" fill="url(#arena-robot-head-fill)" />
          <path
            d="M15.4 6.2 C18.9 8.1 20.2 11.6 19.4 16.2 C18.7 19.4 16.4 21.1 13.6 21 C16.8 18.6 18.2 13.8 16.6 8.6 C16.3 7.6 15.9 6.8 15.4 6.2 Z"
            fill="url(#arena-robot-band-fill)"
            opacity="0.92"
          />
          <ellipse cx="9.4" cy="9.1" rx="3.4" ry="2.1" fill="#9FD0FF" opacity="0.28" />

          <g className="arena-robot-ear-left">
            <circle cx="4.45" cy="13.35" r="2.2" fill="url(#arena-robot-ear-fill)" />
            <circle cx="4.45" cy="13.35" r="0.95" fill="#0B1220" />
            <circle cx="4.15" cy="13.05" r="0.32" fill="#8EC5FF" opacity="0.7" />
          </g>
          <g className="arena-robot-ear-right">
            <circle cx="19.55" cy="13.35" r="2.2" fill="url(#arena-robot-ear-fill)" />
            <circle cx="19.55" cy="13.35" r="0.95" fill="#0B1220" />
            <circle cx="19.25" cy="13.05" r="0.32" fill="#8EC5FF" opacity="0.7" />
          </g>

          <ellipse cx="12" cy="13.45" rx="5.35" ry="4.85" fill="url(#arena-robot-visor-fill)" />
          <ellipse cx="10.15" cy="11.55" rx="2.15" ry="1.05" fill="#FFFFFF" opacity="0.16" />

          <g className="arena-robot-eyes">
            <circle cx="9.7" cy="13.05" r="1.55" fill="#00E0FF" />
            <circle cx="9.7" cy="13.05" r="0.72" fill="#BFFFFF" />
            <circle cx="9.35" cy="12.7" r="0.28" fill="#FFFFFF" />
            <circle cx="14.3" cy="13.05" r="1.55" fill="#FF2BD6" />
            <circle cx="14.3" cy="13.05" r="0.72" fill="#FFB3EC" />
            <circle cx="13.95" cy="12.7" r="0.28" fill="#FFFFFF" />
          </g>

          <path
            d="M10.35 15.7 Q12 17.15 13.65 15.7"
            stroke="#4B5568"
            strokeWidth="0.85"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      </g>
    </svg>
  );
}

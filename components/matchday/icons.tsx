// Line icons on a 24px grid, 1.75px stroke, rounded joins, per the system. Inline
// SVG keeps the chrome dependency free and avoids emoji. Colour comes from
// currentColor, so active (Volt) and resting (text-lo) are set by the nav.

type IconProps = { size?: number };

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function CompareIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 8h13l-3-3" />
      <path d="M20 16H7l3 3" />
    </svg>
  );
}

export function ReplayIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10.5 9.5l4 2.5-4 2.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FeedIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function YouIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </svg>
  );
}

export function AskArrowIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </svg>
  );
}

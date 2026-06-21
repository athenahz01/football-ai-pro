"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  CompareIcon,
  FeedIcon,
  ReplayIcon,
  YouIcon,
  AskArrowIcon,
} from "../icons";

// Mobile bottom tab bar, fixed, 62px plus the safe area inset. Order: Compare,
// Replay, Ask (raised and glowing in the centre), Feed, You. Scout lives inside
// Compare and search. Active route is Volt. Targets are at least 44px.

const LEFT = [
  { href: "/compare", label: "Compare", Icon: CompareIcon },
  { href: "/replay", label: "Replay", Icon: ReplayIcon },
];
const RIGHT = [
  { href: "/community", label: "Feed", Icon: FeedIcon },
  { href: "/you", label: "You", Icon: YouIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <nav className="md-bottomnav" aria-label="Primary">
      {LEFT.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`md-tab-item ${isActive(href) ? "md-tab-item--active" : ""}`}
          aria-current={isActive(href) ? "page" : undefined}
        >
          <span className="md-tab-glyph">
            <Icon size={22} />
          </span>
          {label}
        </Link>
      ))}

      <div className="md-tab-raised">
        <Link href="/ask" className="md-tab-raised-btn" aria-label="Ask">
          <AskArrowIcon size={24} />
        </Link>
        <span className="md-tab-raised-label">Ask</span>
      </div>

      {RIGHT.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`md-tab-item ${isActive(href) ? "md-tab-item--active" : ""}`}
          aria-current={isActive(href) ? "page" : undefined}
        >
          <span className="md-tab-glyph">
            <Icon size={22} />
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
}

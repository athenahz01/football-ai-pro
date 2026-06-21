"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { HomeIcon, FeedIcon, YouIcon, AskArrowIcon } from "../icons";

// Mobile spine. The bar is centred on a raised, glowing Ask, with Home, Feed, and
// You around it. Compare, Scout, and Replay are no longer cold tabs; they are reached
// in context from answers and profiles. Targets are at least 44px.

const LEFT = [
  { href: "/", label: "Home", Icon: HomeIcon, exact: true },
  { href: "/community", label: "Feed", Icon: FeedIcon, exact: false },
];
const RIGHT = [{ href: "/you", label: "You", Icon: YouIcon, exact: false }];

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <nav className="md-bottomnav" aria-label="Primary">
      {LEFT.map(({ href, label, Icon, exact }) => (
        <Link
          key={href}
          href={href}
          className={`md-tab-item ${isActive(href, exact) ? "md-tab-item--active" : ""}`}
          aria-current={isActive(href, exact) ? "page" : undefined}
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

      {RIGHT.map(({ href, label, Icon, exact }) => (
        <Link
          key={href}
          href={href}
          className={`md-tab-item ${isActive(href, exact) ? "md-tab-item--active" : ""}`}
          aria-current={isActive(href, exact) ? "page" : undefined}
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

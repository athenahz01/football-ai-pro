"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountChip } from "./account-chip";
import { NavAsk } from "./nav-ask";

// Desktop top nav, fixed at 64px. The MATCHDAY wordmark, the primary links with a
// Volt underline on the active route, the persistent Ask field, a Go Pro affordance,
// and the account chip. Links use the client router, so there is no full reload.

// The spine on desktop: the wordmark home, a compact set of links (Home and your
// world), and the persistent Ask field that is always present. Compare, Scout, and
// Replay are reached in context, not as cold tabs.
const LINKS = [
  { href: "/", label: "Home", exact: true },
  { href: "/community", label: "Feed", exact: false },
  { href: "/you", label: "Your world", exact: false },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="md-topnav">
      <Link href="/" className="md-wordmark">
        MATCHDAY
      </Link>
      <nav className="md-topnav-links" aria-label="Primary">
        {LINKS.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`md-navlink ${active ? "md-navlink--active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <NavAsk />
      <div className="md-topnav-end">
        <Link href="/ask" className="md-btn md-btn--primary md-btn--sm">
          Go Pro
        </Link>
        <AccountChip />
      </div>
    </header>
  );
}

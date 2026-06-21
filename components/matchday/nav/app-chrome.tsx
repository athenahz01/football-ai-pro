import type { ReactNode } from "react";

import { TopNav } from "./top-nav";
import { BottomNav } from "./bottom-nav";

// App chrome wrapping every page: the fixed desktop top nav, the fixed mobile bottom
// tab bar, the page content, and the data credit footer. The two navs hide for the
// other breakpoint via CSS. Pages render their own main, so the per page layout and
// the legacy legibility shim continue to work.

export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <TopNav />
      {children}
      <footer className="md-footer">
        World Cup data provided by StatsBomb Open Data. Numbers come only from real
        query results.
      </footer>
      <BottomNav />
    </>
  );
}

import type { ReactNode } from "react";

import { pageHorizontalGutterClassName } from "@/lib/layout/pageGutters";

/**
 * Breaks out of the root `max-w-7xl` main column so content spans the viewport
 * with the same horizontal gutters as the navbar on full-bleed routes.
 */
export function FullBleedContent({ children }: { children: ReactNode }) {
  return (
    <div
      className={`relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 box-border ${pageHorizontalGutterClassName}`}
    >
      <div className="w-full min-w-0 max-w-none">{children}</div>
    </div>
  );
}

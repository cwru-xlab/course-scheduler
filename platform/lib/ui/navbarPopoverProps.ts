import { useEffect, useRef } from "react";

/** Shared Popover settings for navbar panels (settings, live users). */
export const navbarPopoverProps = {
  /** Click to open — hover + portaled content is unreliable. */
  shouldCloseOnScroll: false,
  shouldBlockScroll: false,
  offset: 6,
  showArrow: true,
} as const;

/**
 * Keep a popover panel inside the viewport by mirroring the height clamp that
 * React Aria computes on the portaled overlay wrapper (`max-height` inline
 * style, set so the popover fits above or below the trigger). The clamp is not
 * inherited by inner content — fixed `max-h-*` classes would overflow past it —
 * so panels attach this ref and track the wrapper's clamped height instead.
 * The hook is in this file so every toolbar panel (Filters / Columns / Colors /
 * Crosslist) shares one implementation.
 */
export function useOverlayClampedHeight<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    const host = el
      ?.closest("[data-slot='base']")
      ?.parentElement?.parentElement as HTMLElement | null | undefined;
    if (!el || !host) return;

    const apply = () => {
      // Unclamped wrappers size to their content, so this only ever shrinks
      // the panel to what React Aria says fits.
      const cap = host.clientHeight;
      if (cap > 0) el.style.maxHeight = `${cap}px`;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(host);
    return () => {
      observer.disconnect();
      el.style.maxHeight = "";
    };
  }, [active]);

  return ref;
}

/** Fixed width for toolbar chip popovers (Columns / Colors / Crosslist). */
export const toolbarChipPopoverContentClass =
  "w-[min(640px,92vw)] min-w-[min(640px,92vw)] max-w-[min(640px,92vw)] p-0";

/** Content-sized popover for short option lists (e.g. Room order). */
export const toolbarCompactPopoverContentClass =
  "w-max max-w-[min(280px,92vw)] p-0";

/** Form-style toolbar popover (e.g. Filters) — wide enough for controls, not chip-grid wide. */
export const toolbarFormPopoverContentClass =
  "w-[min(400px,92vw)] max-w-[min(400px,92vw)] p-0";

/**
 * `shouldCloseOnInteractOutside` for toolbar panels that embed select controls
 * (e.g. floating Filters): presses inside a portal'd editor select menu must
 * not dismiss the panel.
 */
export function toolbarPanelCloseOnInteractOutside(element: Element): boolean {
  return !element.closest(".editor-select-menu, [role='listbox']");
}

export const toolbarChipPopoverGridClass =
  "grid max-h-72 gap-2 overflow-y-auto";

export const toolbarChipPopoverChipClass =
  "inline-flex h-7 min-w-0 w-full items-center justify-center gap-1 overflow-hidden rounded-md border px-2 text-[10px] font-medium leading-none transition-colors";

/**
 * Column count that keeps chip rows even and roomy enough to read labels
 * (e.g. 24 → 6×4, 20 → 5×4, 14 → 5×3).
 */
export function toolbarChipPopoverColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return count;

  // Cap width so labels (esp. Columns / Crosslist) are not crushed.
  const minCols = 4;
  const maxCols = 6;
  const maxRows = 5;

  const exact: number[] = [];
  for (let cols = maxCols; cols >= minCols; cols -= 1) {
    if (count % cols !== 0) continue;
    const rows = count / cols;
    if (rows >= 2 && rows <= maxRows) exact.push(cols);
  }
  if (exact.length > 0) {
    // Prefer taller grids over very wide 2-row strips.
    const preferRows = [4, 3, 5, 2];
    for (const rows of preferRows) {
      const match = exact.find((cols) => count / cols === rows);
      if (match) return match;
    }
    return exact[0]!;
  }

  // No clean divisor: maximize how full the last row is.
  let best = 5;
  let bestFill = -1;
  for (let cols = maxCols; cols >= minCols; cols -= 1) {
    const rows = Math.ceil(count / cols);
    if (rows > maxRows) continue;
    const last = count - (rows - 1) * cols;
    const fill = last / cols;
    if (fill > bestFill) {
      bestFill = fill;
      best = cols;
    }
  }
  return best;
}

export function toolbarChipPopoverGridStyle(count: number): {
  gridTemplateColumns: string;
} {
  return {
    gridTemplateColumns: `repeat(${toolbarChipPopoverColumns(count)}, minmax(0, 1fr))`,
  };
}

/** Shared Popover settings for navbar panels (settings, live users). */
export const navbarPopoverProps = {
  /** Click to open — hover + portaled content is unreliable. */
  shouldCloseOnScroll: false,
  shouldBlockScroll: false,
  offset: 6,
  showArrow: true,
} as const;

/** Fixed width for toolbar chip popovers (Columns / Colors / Crosslist). */
export const toolbarChipPopoverContentClass =
  "w-[min(640px,92vw)] min-w-[min(640px,92vw)] max-w-[min(640px,92vw)] p-0";

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

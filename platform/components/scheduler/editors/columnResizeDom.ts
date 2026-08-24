import type { EditorColumnSpec } from "./useEditorColumnVisibility";

export const EDITOR_ACTIONS_COLUMN_PX = 124;

/** Absolute floor while dragging (narrower than preferred mins). */
export const MIN_COLUMN_PX = 20;

/** Preferred floor when no `minWidthPx` on the spec. */
export function columnMinWidthPx(spec: EditorColumnSpec): number {
  if (spec.minWidthPx != null && spec.minWidthPx > 0) {
    return Math.max(MIN_COLUMN_PX, Math.round(spec.minWidthPx));
  }
  if (spec.weight >= 14) return 140;
  if (spec.weight >= 8) return 100;
  return 80;
}

function dataBudgetPx(containerWidth: number): number {
  return Math.max(0, containerWidth - EDITOR_ACTIONS_COLUMN_PX);
}

export function sumDataWidths(
  widths: Record<string, number>,
  visibleSpecs: EditorColumnSpec[],
): number {
  return visibleSpecs.reduce(
    (sum, s) => sum + Math.max(MIN_COLUMN_PX, Math.round(widths[s.id] ?? columnMinWidthPx(s))),
    0,
  );
}

export function tableWidthPx(
  widths: Record<string, number>,
  visibleSpecs: EditorColumnSpec[],
): number {
  return sumDataWidths(widths, visibleSpecs) + EDITOR_ACTIONS_COLUMN_PX;
}

/**
 * Clamp each column to its min width. If total preferred width is less than the
 * container budget, distribute leftover space by weight. Never shrink below preferred
 * mins just to fit — horizontal scroll handles overflow.
 */
export function fitWidthsToContainer(
  widths: Record<string, number>,
  visibleSpecs: EditorColumnSpec[],
  containerWidth: number,
): Record<string, number> {
  if (visibleSpecs.length === 0) return {};

  const ids = visibleSpecs.map((s) => s.id);
  const mins = visibleSpecs.map((s) => columnMinWidthPx(s));
  let values = ids.map((id, i) =>
    Math.max(mins[i], Math.round(widths[id] ?? mins[i])),
  );
  let sum = values.reduce((a, b) => a + b, 0);

  if (containerWidth <= 0) {
    return Object.fromEntries(ids.map((id, i) => [id, values[i]]));
  }

  const budget = dataBudgetPx(containerWidth);
  if (sum < budget) {
    const extra = budget - sum;
    const weights = visibleSpecs.map((s) => s.weight);
    const wSum = weights.reduce((a, b) => a + b, 0) || 1;
    values = values.map((v, i) => v + Math.round((extra * weights[i]) / wSum));
    sum = values.reduce((a, b) => a + b, 0);
    values[values.length - 1] += budget - sum;
  }

  return Object.fromEntries(ids.map((id, i) => [id, values[i]]));
}

/**
 * Resize `columnId` by delta: grow/shrink that column only (table width changes).
 * Neighbors are untouched so horizontal scroll remains meaningful.
 */
export function computeResizedWidths(
  baseline: Record<string, number>,
  visibleSpecs: EditorColumnSpec[],
  columnId: string,
  startWidth: number,
  deltaFromStart: number,
): Record<string, number> {
  const spec = visibleSpecs.find((s) => s.id === columnId);
  if (!spec) return baseline;

  const minPx = columnMinWidthPx(spec);
  const next = { ...baseline };
  next[columnId] = Math.max(minPx, Math.round(startWidth + deltaFromStart));
  return next;
}

export function applyColumnWidthsToTable(
  table: HTMLTableElement | null,
  widths: Record<string, number>,
  visibleSpecs: EditorColumnSpec[],
  containerWidth: number,
  options?: {
    fit?: boolean;
    /** When true, size the table to the sum of columns present in this table. */
    paneSumOnly?: boolean;
    includeActions?: boolean;
  },
): void {
  if (!table) return;

  const fitted =
    options?.fit === false
      ? widths
      : fitWidthsToContainer(widths, visibleSpecs, containerWidth);

  let dataSum = 0;
  for (const spec of visibleSpecs) {
    const col = table.querySelector<HTMLTableColElement>(
      `colgroup col[data-col-id="${CSS.escape(spec.id)}"]`,
    );
    if (!col) continue;
    const w = fitted[spec.id] ?? columnMinWidthPx(spec);
    col.style.width = `${w}px`;
    dataSum += w;
  }

  const includeActions = options?.includeActions === true;
  const actionsCol = table.querySelector<HTMLTableColElement>(
    'colgroup col[data-col-id="__actions__"]',
  );
  if (actionsCol) {
    actionsCol.style.width = `${EDITOR_ACTIONS_COLUMN_PX}px`;
    if (includeActions || options?.paneSumOnly) {
      dataSum += EDITOR_ACTIONS_COLUMN_PX;
    }
  }

  if (options?.paneSumOnly) {
    table.style.width = `${dataSum}px`;
    table.style.minWidth = `${dataSum}px`;
    table.style.maxWidth = "";
    return;
  }

  const total =
    sumDataWidths(fitted, visibleSpecs) +
    (actionsCol || includeActions ? EDITOR_ACTIONS_COLUMN_PX : 0);
  const width = Math.max(containerWidth > 0 ? containerWidth : 0, total);
  table.style.width = `${width}px`;
  table.style.minWidth = `${total}px`;
  table.style.maxWidth = "";
}

import type { EditorColumnSpec } from "./useEditorColumnVisibility";

export const EDITOR_ACTIONS_COLUMN_PX = 108;

/** ~two characters at editor table header font size (text-xs uppercase) */
export const MIN_COLUMN_PX = 20;

function dataBudgetPx(containerWidth: number, columnCount: number): number {
  return Math.max(
    columnCount * MIN_COLUMN_PX,
    containerWidth - EDITOR_ACTIONS_COLUMN_PX,
  );
}

/**
 * Scale column widths so data columns sum exactly to container minus fixed actions.
 */
export function fitWidthsToContainer(
  widths: Record<string, number>,
  visibleSpecs: EditorColumnSpec[],
  containerWidth: number,
): Record<string, number> {
  if (containerWidth <= 0 || visibleSpecs.length === 0) return {};

  const budget = dataBudgetPx(containerWidth, visibleSpecs.length);
  const ids = visibleSpecs.map((s) => s.id);
  let values = ids.map((id) => Math.max(MIN_COLUMN_PX, Math.round(widths[id] ?? MIN_COLUMN_PX)));
  let sum = values.reduce((a, b) => a + b, 0);

  if (sum === budget) {
    return Object.fromEntries(ids.map((id, i) => [id, values[i]]));
  }

  if (sum > budget) {
    let excess = sum - budget;
    while (excess > 0) {
      const slack = values.map((v) => v - MIN_COLUMN_PX);
      const slackSum = slack.reduce((a, b) => a + b, 0);
      if (slackSum <= 0) break;
      values = values.map((v, i) => {
        const share = (slack[i] / slackSum) * excess;
        const drop = Math.min(slack[i], Math.max(1, Math.round(share)));
        return v - drop;
      });
      sum = values.reduce((a, b) => a + b, 0);
      excess = sum - budget;
    }
    if (sum > budget) {
      values = values.map((v) => MIN_COLUMN_PX);
      const minSum = values.reduce((a, b) => a + b, 0);
      const extra = budget - minSum;
      if (extra > 0) {
        const weights = visibleSpecs.map((s) => s.weight);
        const wSum = weights.reduce((a, b) => a + b, 0) || 1;
        values = values.map((v, i) => v + Math.floor((extra * weights[i]) / wSum));
        sum = values.reduce((a, b) => a + b, 0);
        values[values.length - 1] += budget - sum;
      }
    }
  } else {
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
 * Drag the right edge of `columnId`: that column grows/shrinks; neighbor to the right
 * (or columns to the left for the last data column) does the opposite. Total width unchanged.
 */
export function computeResizedWidths(
  baseline: Record<string, number>,
  visibleSpecs: EditorColumnSpec[],
  columnId: string,
  startWidth: number,
  deltaFromStart: number,
): Record<string, number> {
  const specIndex = visibleSpecs.findIndex((s) => s.id === columnId);
  if (specIndex < 0) return baseline;

  const primaryId = columnId;
  const primaryBase = baseline[primaryId] ?? MIN_COLUMN_PX;
  const targetPrimary = Math.max(
    MIN_COLUMN_PX,
    Math.round(startWidth + deltaFromStart),
  );
  let delta = targetPrimary - primaryBase;
  const next = { ...baseline };
  next[primaryId] = primaryBase;

  const applyToIndex = (index: number, amount: number): number => {
    if (amount === 0 || index < 0 || index >= visibleSpecs.length) return amount;
    const id = visibleSpecs[index].id;
    const old = next[id] ?? MIN_COLUMN_PX;
    if (amount > 0) {
      const shrink = Math.min(amount, old - MIN_COLUMN_PX);
      next[id] = old - shrink;
      next[primaryId] = (next[primaryId] ?? primaryBase) + shrink;
      return amount - shrink;
    }
    const grow = -amount;
    next[id] = old + grow;
    next[primaryId] = (next[primaryId] ?? primaryBase) - grow;
    return 0;
  };

  if (specIndex < visibleSpecs.length - 1) {
    let remaining = delta;
    remaining = applyToIndex(specIndex + 1, remaining);
    if (remaining > 0) {
      for (let i = specIndex - 1; i >= 0 && remaining > 0; i--) {
        remaining = applyToIndex(i, remaining);
      }
    } else if (remaining < 0) {
      for (let i = specIndex - 1; i >= 0 && remaining < 0; i--) {
        remaining = applyToIndex(i, remaining);
      }
    }
  } else {
    let remaining = delta;
    for (let i = specIndex - 1; i >= 0 && remaining !== 0; i--) {
      remaining = applyToIndex(i, remaining);
    }
  }

  next[primaryId] = Math.max(MIN_COLUMN_PX, next[primaryId] ?? primaryBase);
  return next;
}

export function applyColumnWidthsToTable(
  table: HTMLTableElement | null,
  widths: Record<string, number>,
  visibleSpecs: EditorColumnSpec[],
  containerWidth: number,
  options?: { fit?: boolean },
): void {
  if (!table || containerWidth <= 0) return;

  const fitted =
    options?.fit === false
      ? widths
      : fitWidthsToContainer(widths, visibleSpecs, containerWidth);

  for (const spec of visibleSpecs) {
    const w = fitted[spec.id] ?? MIN_COLUMN_PX;
    const col = table.querySelector<HTMLTableColElement>(
      `colgroup col[data-col-id="${CSS.escape(spec.id)}"]`,
    );
    if (col) col.style.width = `${w}px`;
  }

  const actionsCol = table.querySelector<HTMLTableColElement>(
    'colgroup col[data-col-id="__actions__"]',
  );
  if (actionsCol) actionsCol.style.width = `${EDITOR_ACTIONS_COLUMN_PX}px`;

  table.style.width = `${containerWidth}px`;
  table.style.minWidth = `${containerWidth}px`;
  table.style.maxWidth = `${containerWidth}px`;
}

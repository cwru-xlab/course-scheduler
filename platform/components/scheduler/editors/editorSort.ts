import type { EditorColumnFilterDef } from "./editorFilters";

export type SortDirection = "asc" | "desc";

export type EditorSortState = {
  columnId: string;
  direction: SortDirection;
} | null;

export type EditorColumnSortDef<TRow> = {
  columnId: string;
  getSortValue: (row: TRow) => unknown;
};

export function sortValueFromUnknown(raw: unknown): string | number {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number") return raw;
  if (Array.isArray(raw)) return raw.map(String).join(", ");
  return String(raw).trim();
}

function compareSortValues(a: unknown, b: unknown): number {
  const sa = sortValueFromUnknown(a);
  const sb = sortValueFromUnknown(b);

  if (typeof sa === "number" && typeof sb === "number") {
    return sa - sb;
  }

  return String(sa).localeCompare(String(sb), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function applyEditorColumnSort<TRow>(
  rows: TRow[],
  sort: EditorSortState,
  defs: EditorColumnSortDef<TRow>[],
): TRow[] {
  if (!sort) return rows;
  const def = defs.find((d) => d.columnId === sort.columnId);
  if (!def) return rows;

  const sorted = [...rows];
  sorted.sort((rowA, rowB) => {
    const cmp = compareSortValues(def.getSortValue(rowA), def.getSortValue(rowB));
    return sort.direction === "asc" ? cmp : -cmp;
  });
  return sorted;
}

/** Build sort defs from existing column filter defs (same getValue). */
export function sortDefsFromFilterDefs<TRow>(
  defs: EditorColumnFilterDef<TRow>[],
): EditorColumnSortDef<TRow>[] {
  return defs.map((def) => ({
    columnId: def.columnId,
    getSortValue: (row) => sortValueFromUnknown(def.getValue(row)),
  }));
}

export function nextSortState(
  current: EditorSortState,
  columnId: string,
): EditorSortState {
  if (current?.columnId !== columnId) {
    return { columnId, direction: "asc" };
  }
  if (current.direction === "asc") {
    return { columnId, direction: "desc" };
  }
  return null;
}

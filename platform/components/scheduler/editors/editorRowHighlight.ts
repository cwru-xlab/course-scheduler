/** Faint green background for rows that were just added via the add modal. */
export const RECENTLY_ADDED_ROW_CLASS = "bg-emerald-50/70";

export function editorRowKey(scope: string, rowId: string) {
  return `${scope}:${rowId}`;
}

export function recentlyAddedRowClass(base: string, isRecent: boolean) {
  return isRecent ? `${base} ${RECENTLY_ADDED_ROW_CLASS}` : base;
}

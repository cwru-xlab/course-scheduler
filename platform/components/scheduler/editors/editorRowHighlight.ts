import type { RecentChangeKind } from "@/lib/scheduling/schedulingDataFingerprint";

/** Rows the user just saved locally (or newly added). */
export const LOCAL_RECENT_ROW_CLASS = "bg-emerald-50/70";

/** Rows that changed when loading updates from the server. */
export const REMOTE_RECENT_ROW_CLASS = "bg-sky-50/70";

/** @deprecated alias */
export const RECENTLY_ADDED_ROW_CLASS = LOCAL_RECENT_ROW_CLASS;

export function editorRowKey(scope: string, rowId: string) {
  return `${scope}:${rowId}`;
}

export function rowHighlightClass(
  base: string,
  opts: {
    added?: boolean;
    changeKind?: RecentChangeKind | null;
  },
): string {
  if (opts.added || opts.changeKind === "local") {
    return `${base} ${LOCAL_RECENT_ROW_CLASS}`;
  }
  if (opts.changeKind === "remote") {
    return `${base} ${REMOTE_RECENT_ROW_CLASS}`;
  }
  return base;
}

export function recentlyAddedRowClass(base: string, isRecent: boolean) {
  return isRecent ? `${base} ${LOCAL_RECENT_ROW_CLASS}` : base;
}

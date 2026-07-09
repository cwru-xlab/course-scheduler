"use client";

import { useCallback, useEffect, useState } from "react";

import { nextSortState, type EditorSortState } from "./editorSort";

function loadSort(storageKey: string): EditorSortState {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "columnId" in parsed &&
      "direction" in parsed
    ) {
      const candidate = parsed as { columnId: unknown; direction: unknown };
      if (
        typeof candidate.columnId === "string" &&
        (candidate.direction === "asc" || candidate.direction === "desc")
      ) {
        return { columnId: candidate.columnId, direction: candidate.direction };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function useEditorColumnSort(editorKey: string) {
  const storageKey = `wsom-editor-sort-${editorKey}`;
  const [sort, setSort] = useState<EditorSortState>(null);

  useEffect(() => {
    setSort(loadSort(storageKey));
  }, [storageKey]);

  const persist = useCallback(
    (next: EditorSortState) => {
      setSort(next);
      if (typeof window === "undefined") return;
      try {
        if (next) {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const toggleSort = useCallback(
    (columnId: string) => {
      persist(nextSortState(sort, columnId));
    },
    [persist, sort],
  );

  return { sort, toggleSort, setSort: persist };
}

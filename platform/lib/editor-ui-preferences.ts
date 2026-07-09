"use client";

import { useCallback, useEffect, useState } from "react";

const SHOW_COLUMNS_INLINE_PREFIX = "wsom-editor-prefs-show-columns-inline";
export const HIDE_ARCHIVED_SECTIONS_KEY = "wsom-editor-prefs-hide-archived-sections";

function readBoolean(key: string, defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    /* ignore */
  }
  return defaultValue;
}

function writeBoolean(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore quota / private mode */
  }
}

export function usePersistedBoolean(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(readBoolean(key, defaultValue));
  }, [key, defaultValue]);

  const persist = useCallback(
    (next: boolean) => {
      setValue(next);
      writeBoolean(key, next);
    },
    [key],
  );

  return [value, persist] as const;
}

export function showColumnsInlineKey(editorKey: string) {
  return `${SHOW_COLUMNS_INLINE_PREFIX}-${editorKey}`;
}

export function useShowColumnsInlineExpanded(editorKey: string) {
  return usePersistedBoolean(showColumnsInlineKey(editorKey), false);
}

export function useHideArchivedSections() {
  return usePersistedBoolean(HIDE_ARCHIVED_SECTIONS_KEY, true);
}

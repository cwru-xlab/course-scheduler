"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type EditorColumnSpec = {
  id: string;
  label: string;
  defaultVisible: boolean;
  /** Relative width when column is visible (normalized with other visible columns). */
  weight: number;
};

function defaultVisibleSet(specs: EditorColumnSpec[]): Set<string> {
  return new Set(specs.filter((s) => s.defaultVisible).map((s) => s.id));
}

function loadVisibleIds(storageKey: string, specs: EditorColumnSpec[]): Set<string> {
  const fallback = defaultVisibleSet(specs);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const valid = new Set(
      parsed.filter((id): id is string => typeof id === "string" && specs.some((s) => s.id === id)),
    );
    return valid.size > 0 ? valid : fallback;
  } catch {
    return fallback;
  }
}

export function useEditorColumnVisibility(editorKey: string, specs: EditorColumnSpec[]) {
  const storageKey = `wsom-editor-columns-${editorKey}`;
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => defaultVisibleSet(specs));

  useEffect(() => {
    setVisibleIds(loadVisibleIds(storageKey, specs));
  }, [storageKey, specs]);

  const persist = useCallback(
    (next: Set<string>) => {
      setVisibleIds(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {
        /* ignore quota / private mode */
      }
    },
    [storageKey],
  );

  const toggleColumn = useCallback(
    (id: string, checked: boolean) => {
      const next = new Set(visibleIds);
      if (checked) {
        next.add(id);
      } else {
        if (next.size <= 1) return;
        next.delete(id);
      }
      persist(next);
    },
    [visibleIds, persist],
  );

  const showAllColumns = useCallback(() => {
    persist(new Set(specs.map((s) => s.id)));
  }, [persist, specs]);

  const hideAllColumns = useCallback(() => {
    const keep = specs.find((s) => s.id === "id") ?? specs[0];
    if (!keep) return;
    persist(new Set([keep.id]));
  }, [persist, specs]);

  const visibleSpecs = useMemo(
    () => specs.filter((s) => visibleIds.has(s.id)),
    [specs, visibleIds],
  );

  const widthFor = useCallback(
    (spec: EditorColumnSpec) => {
      const total = visibleSpecs.reduce((sum, s) => sum + s.weight, 0);
      if (total <= 0) return "0%";
      return `${((spec.weight / total) * 100).toFixed(2)}%`;
    },
    [visibleSpecs],
  );

  return {
    specs,
    visibleSpecs,
    visibleIds,
    toggleColumn,
    showAllColumns,
    hideAllColumns,
    widthFor,
    isVisible: (id: string) => visibleIds.has(id),
  };
}

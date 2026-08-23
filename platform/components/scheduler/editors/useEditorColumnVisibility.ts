"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type EditorColumnSpec = {
  id: string;
  label: string;
  defaultVisible: boolean;
  /** Relative width when column is visible (normalized with other visible columns). */
  weight: number;
  /** Freeze this column on the left while the table scrolls horizontally. */
  pinned?: "left";
  /** Preferred minimum width in px (horizontal scroll when mins exceed card). */
  minWidthPx?: number;
};

export type EditorColumnPreset = {
  id: string;
  label: string;
  /** Column ids to show. Unknown ids are ignored. */
  columnIds: string[];
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

export function useEditorColumnVisibility(
  editorKey: string,
  specs: EditorColumnSpec[],
  presets?: EditorColumnPreset[],
) {
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

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = presets?.find((p) => p.id === presetId);
      if (!preset) return;
      const next = new Set(
        preset.columnIds.filter((id) => specs.some((s) => s.id === id)),
      );
      if (next.size === 0) return;
      persist(next);
    },
    [presets, persist, specs],
  );

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
    presets: presets ?? [],
    toggleColumn,
    showAllColumns,
    hideAllColumns,
    applyPreset,
    widthFor,
    isVisible: (id: string) => visibleIds.has(id),
  };
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  applyColumnWidthsToTable,
  columnMinWidthPx,
  computeResizedWidths,
  EDITOR_ACTIONS_COLUMN_PX,
  fitWidthsToContainer,
  MIN_COLUMN_PX,
  sumDataWidths,
  tableWidthPx,
} from "./columnResizeDom";
import type { EditorColumnSpec } from "./useEditorColumnVisibility";

export { EDITOR_ACTIONS_COLUMN_PX };

/** Ignore sub-pixel / scrollbar noise that fires ResizeObserver during fast scroll. */
const CONTAINER_WIDTH_EPSILON_PX = 4;

function loadSavedWidths(storageKey: string): Record<string, number> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<string, number> = {};
    for (const [id, w] of Object.entries(parsed)) {
      if (typeof w === "number" && Number.isFinite(w) && w > 0) {
        out[id] = Math.round(w);
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

function proportionalWidths(
  visibleSpecs: EditorColumnSpec[],
  containerWidth: number,
  saved: Record<string, number> | null,
): Record<string, number> {
  const budget =
    containerWidth > 0
      ? Math.max(
          visibleSpecs.reduce((sum, s) => sum + columnMinWidthPx(s), 0),
          containerWidth - EDITOR_ACTIONS_COLUMN_PX,
        )
      : visibleSpecs.reduce((sum, s) => sum + columnMinWidthPx(s), 0);

  const totalWeight = visibleSpecs.reduce((sum, s) => sum + s.weight, 0);
  const raw: Record<string, number> = {};

  for (const spec of visibleSpecs) {
    if (saved?.[spec.id] != null) {
      raw[spec.id] = Math.max(columnMinWidthPx(spec), saved[spec.id]);
    } else if (totalWeight > 0 && budget > 0) {
      raw[spec.id] = Math.max(
        columnMinWidthPx(spec),
        Math.round((spec.weight / totalWeight) * budget),
      );
    } else {
      raw[spec.id] = columnMinWidthPx(spec);
    }
  }

  return fitWidthsToContainer(raw, visibleSpecs, containerWidth);
}

export function useEditorColumnWidths(
  editorKey: string,
  visibleSpecs: EditorColumnSpec[],
) {
  const storageKey = `wsom-editor-column-widths-${editorKey}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [widthsPx, setWidthsPx] = useState<Record<string, number>>({});
  const savedRef = useRef<Record<string, number> | null>(null);
  const layoutKeyRef = useRef("");
  const draftWidthsRef = useRef<Record<string, number>>({});
  const resizeSessionRef = useRef<{
    columnId: string;
    startX: number;
    startWidth: number;
    baselineWidths: Record<string, number>;
    tables: HTMLTableElement[];
  } | null>(null);

  useEffect(() => {
    savedRef.current = loadSavedWidths(storageKey);
  }, [storageKey]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const next = el.clientWidth;
      setContainerWidth((prev) =>
        Math.abs(prev - next) < CONTAINER_WIDTH_EPSILON_PX ? prev : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visibleSpecs]);

  const visibleLayoutKey = useMemo(
    () => visibleSpecs.map((s) => s.id).join("\0"),
    [visibleSpecs],
  );

  const refitWidths = useCallback(
    (raw: Record<string, number>) => {
      if (containerWidth <= 0) return raw;
      const dataSum = sumDataWidths(raw, visibleSpecs);
      const budget = Math.max(0, containerWidth - EDITOR_ACTIONS_COLUMN_PX);
      // Already wider than the card: keep exact widths so sticky offsets do not jump
      // when ResizeObserver flickers during horizontal scroll.
      if (dataSum >= budget) {
        const next: Record<string, number> = {};
        for (const spec of visibleSpecs) {
          next[spec.id] = Math.max(
            columnMinWidthPx(spec),
            Math.round(raw[spec.id] ?? columnMinWidthPx(spec)),
          );
        }
        return next;
      }
      return fitWidthsToContainer(raw, visibleSpecs, containerWidth);
    },
    [containerWidth, visibleSpecs],
  );

  useEffect(() => {
    if (containerWidth <= 0 || visibleSpecs.length === 0) return;

    if (layoutKeyRef.current !== visibleLayoutKey) {
      layoutKeyRef.current = visibleLayoutKey;
      setWidthsPx(
        proportionalWidths(visibleSpecs, containerWidth, savedRef.current),
      );
      return;
    }

    setWidthsPx((prev) => refitWidths(prev));
  }, [containerWidth, visibleSpecs, visibleLayoutKey, refitWidths]);

  const persistWidths = useCallback(
    (next: Record<string, number>) => {
      // Clamp to mins; expand into leftover container space if under budget.
      // Do not shrink below preferred widths when wider than the card.
      const fitted =
        containerWidth > 0 ? fitWidthsToContainer(next, visibleSpecs, containerWidth) : next;
      savedRef.current = fitted;
      try {
        localStorage.setItem(storageKey, JSON.stringify(fitted));
      } catch {
        /* ignore */
      }
      return fitted;
    },
    [storageKey, containerWidth, visibleSpecs],
  );

  const startResize = useCallback(
    (
      columnId: string,
      clientX: number,
      tables: HTMLTableElement | Array<HTMLTableElement | null> | null,
    ) => {
      const startWidth = widthsPx[columnId];
      const tableList = (Array.isArray(tables) ? tables : [tables]).filter(
        (t): t is HTMLTableElement => t != null,
      );
      if (startWidth == null || tableList.length === 0 || containerWidth <= 0) return;

      const baselineWidths = { ...widthsPx };
      draftWidthsRef.current = baselineWidths;
      resizeSessionRef.current = {
        columnId,
        startX: clientX,
        startWidth,
        baselineWidths,
        tables: tableList,
      };

      const prevUserSelect = document.body.style.userSelect;
      const prevCursor = document.body.style.cursor;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      let rafId = 0;

      const onMove = (e: MouseEvent) => {
        const session = resizeSessionRef.current;
        if (!session) return;
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const delta = e.clientX - session.startX;
          const resized = computeResizedWidths(
            session.baselineWidths,
            visibleSpecs,
            session.columnId,
            session.startWidth,
            delta,
          );
          draftWidthsRef.current = resized;
          for (const table of session.tables) {
            applyColumnWidthsToTable(
              table,
              draftWidthsRef.current,
              visibleSpecs,
              containerWidth,
              { fit: false, paneSumOnly: true },
            );
          }
        });
      };

      const onUp = () => {
        cancelAnimationFrame(rafId);
        resizeSessionRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = prevUserSelect;
        document.body.style.cursor = prevCursor;

        const fitted = persistWidths({ ...draftWidthsRef.current });
        setWidthsPx(fitted);
        layoutKeyRef.current = visibleLayoutKey;
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [visibleSpecs, visibleLayoutKey, widthsPx, persistWidths, containerWidth],
  );

  const getWidthPx = useCallback(
    (columnId: string) => {
      if (widthsPx[columnId] != null) return widthsPx[columnId];
      const spec = visibleSpecs.find((s) => s.id === columnId);
      return spec ? columnMinWidthPx(spec) : MIN_COLUMN_PX;
    },
    [widthsPx, visibleSpecs],
  );

  const totalTableWidthPx = useMemo(
    () =>
      Object.keys(widthsPx).length > 0
        ? tableWidthPx(widthsPx, visibleSpecs)
        : 0,
    [widthsPx, visibleSpecs],
  );

  return {
    containerRef,
    containerWidth,
    getWidthPx,
    tableWidthPx: totalTableWidthPx,
    actionsWidthPx: EDITOR_ACTIONS_COLUMN_PX,
    startResize,
  };
}

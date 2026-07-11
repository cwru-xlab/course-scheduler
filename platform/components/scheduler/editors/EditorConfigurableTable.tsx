"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { EditorColumnPicker } from "./EditorColumnPicker";
import { EditorActionsTh, EditorResizableTh } from "./EditorResizableTh";
import { editorTd } from "./EditorTableShell";
import { applyEditorColumnSort, type EditorColumnSortDef } from "./editorSort";
import type { EditorColumnSpec } from "./useEditorColumnVisibility";
import { useEditorColumnVisibility } from "./useEditorColumnVisibility";

export type EditorColumnVisibilityApi = ReturnType<typeof useEditorColumnVisibility>;
import { useEditorColumnWidths } from "./useEditorColumnWidths";
import { useEditorColumnSort } from "./useEditorColumnSort";

type EditorConfigurableTableProps<TRow> = {
  editorKey: string;
  columnSpecs: EditorColumnSpec[];
  rows: TRow[];
  sortDefs?: EditorColumnSortDef<TRow>[];
  getRowKey: (row: TRow, index: number) => string;
  getRowId?: (row: TRow, index: number) => string;
  getRowClassName?: (row: TRow, index: number) => string | undefined;
  renderCell: (columnId: string, row: TRow, index: number) => ReactNode;
  renderActions: (row: TRow, index: number) => ReactNode;
  /** If provided, parent owns column visibility (and renders the picker itself). */
  visibility?: EditorColumnVisibilityApi;
};

/** Fixed row height enables cheap windowing. Chosen to fit compact HeroUI inputs. */
const VIRT_ROW_HEIGHT = 44;
const VIRT_OVERSCAN = 8;
/** Rows beyond this get virtualized inside a scrollable viewport. */
const VIRT_THRESHOLD = 60;
/** Cap on the viewport height for the virtualized scroll area. */
const VIRT_VIEWPORT_MAX_PX = 720;

/** Ref-stabilized callback: identity is stable, latest closure always used. */
function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

type RowSpec = { id: string; label: string };

type RowProps<TRow> = {
  row: TRow;
  rowIndex: number;
  rowId: string | undefined;
  className: string;
  visibleSpecs: RowSpec[];
  actionsWidthPx: number;
  renderCell: (columnId: string, row: TRow, index: number) => ReactNode;
  renderActions: (row: TRow, index: number) => ReactNode;
  virtualized: boolean;
};

function RowInner<TRow>({
  row,
  rowIndex,
  rowId,
  className,
  visibleSpecs,
  actionsWidthPx,
  renderCell,
  renderActions,
  virtualized,
}: RowProps<TRow>) {
  const style = virtualized
    ? ({ height: VIRT_ROW_HEIGHT, maxHeight: VIRT_ROW_HEIGHT } as const)
    : undefined;
  return (
    <tr id={rowId} className={className} style={style}>
      {visibleSpecs.map((spec) => (
        <td key={spec.id} className={editorTd}>
          {renderCell(spec.id, row, rowIndex)}
        </td>
      ))}
      <td
        className={`${editorTd} whitespace-nowrap`}
        style={{
          width: actionsWidthPx,
          minWidth: actionsWidthPx,
          maxWidth: actionsWidthPx,
        }}
      >
        {renderActions(row, rowIndex)}
      </td>
    </tr>
  );
}

const EditorRow = memo(RowInner) as typeof RowInner;

export function EditorConfigurableTable<TRow>({
  editorKey,
  columnSpecs,
  rows,
  sortDefs,
  getRowKey,
  getRowId,
  getRowClassName,
  renderCell,
  renderActions,
  visibility,
}: EditorConfigurableTableProps<TRow>) {
  const tableRef = useRef<HTMLTableElement>(null);
  const internalVisibility = useEditorColumnVisibility(editorKey, columnSpecs);
  const { specs, visibleSpecs, visibleIds, toggleColumn, showAllColumns, hideAllColumns } =
    visibility ?? internalVisibility;
  const {
    containerRef,
    containerWidth,
    getWidthPx,
    actionsWidthPx,
    startResize,
  } = useEditorColumnWidths(editorKey, visibleSpecs);
  const { sort, toggleSort } = useEditorColumnSort(editorKey);

  const sortableColumnIds = useMemo(
    () => new Set((sortDefs ?? []).map((d) => d.columnId)),
    [sortDefs],
  );

  const displayRows = useMemo(() => {
    if (!sortDefs?.length) return rows;
    return applyEditorColumnSort(rows, sort, sortDefs);
  }, [rows, sort, sortDefs]);

  // Shallow-clone visibleSpecs into a shape stable across renders so memoized
  // rows can compare `visibleSpecs` by array identity via useMemo.
  const rowSpecList = useMemo<RowSpec[]>(
    () => visibleSpecs.map((s) => ({ id: s.id, label: s.label })),
    [visibleSpecs],
  );

  // Wrap the user-provided callbacks so React.memo sees a stable identity
  // even when the caller re-creates closures on each render.
  const renderCellRef = useLatestRef(renderCell);
  const renderActionsRef = useLatestRef(renderActions);
  const getRowIdRef = useLatestRef(getRowId);
  const getRowClassNameRef = useLatestRef(getRowClassName);

  const stableRenderCell = useCallback(
    (columnId: string, row: TRow, index: number) =>
      renderCellRef.current(columnId, row, index),
    [renderCellRef],
  );
  const stableRenderActions = useCallback(
    (row: TRow, index: number) => renderActionsRef.current(row, index),
    [renderActionsRef],
  );

  const virtualized = displayRows.length > VIRT_THRESHOLD;

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    if (!virtualized) {
      setScrollTop(0);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setViewportHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [virtualized, containerRef]);

  const { startIndex, endIndex, topPad, bottomPad } = useMemo(() => {
    if (!virtualized) {
      return {
        startIndex: 0,
        endIndex: displayRows.length,
        topPad: 0,
        bottomPad: 0,
      };
    }
    const vh = viewportHeight > 0 ? viewportHeight : VIRT_VIEWPORT_MAX_PX;
    const first = Math.max(0, Math.floor(scrollTop / VIRT_ROW_HEIGHT) - VIRT_OVERSCAN);
    const last = Math.min(
      displayRows.length,
      Math.ceil((scrollTop + vh) / VIRT_ROW_HEIGHT) + VIRT_OVERSCAN,
    );
    return {
      startIndex: first,
      endIndex: last,
      topPad: first * VIRT_ROW_HEIGHT,
      bottomPad: Math.max(0, (displayRows.length - last) * VIRT_ROW_HEIGHT),
    };
  }, [virtualized, viewportHeight, scrollTop, displayRows.length]);

  const scrollRaf = useRef(0);
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!virtualized) return;
      const y = e.currentTarget.scrollTop;
      cancelAnimationFrame(scrollRaf.current);
      scrollRaf.current = requestAnimationFrame(() => setScrollTop(y));
    },
    [virtualized],
  );

  useEffect(
    () => () => {
      cancelAnimationFrame(scrollRaf.current);
    },
    [],
  );

  const tableStyle =
    containerWidth > 0
      ? {
          width: containerWidth,
          minWidth: containerWidth,
          maxWidth: containerWidth,
        }
      : { width: "100%" };

  const scrollWrapperClass = virtualized
    ? "w-full min-w-0 overflow-auto"
    : "w-full min-w-0 overflow-hidden";
  const scrollWrapperStyle = virtualized
    ? { maxHeight: VIRT_VIEWPORT_MAX_PX }
    : undefined;

  const visibleSlice = useMemo(
    () => displayRows.slice(startIndex, endIndex),
    [displayRows, startIndex, endIndex],
  );

  return (
    <>
      {!visibility && (
        <div className="mb-3">
          <EditorColumnPicker
            specs={specs}
            visibleIds={visibleIds}
            onToggle={toggleColumn}
            onShowAll={showAllColumns}
            onHideAll={hideAllColumns}
          />
        </div>
      )}
      <div
        ref={containerRef}
        className={scrollWrapperClass}
        style={scrollWrapperStyle}
        onScroll={virtualized ? handleScroll : undefined}
      >
        <table
          ref={tableRef}
          className="table-fixed border-collapse"
          style={tableStyle}
        >
          <colgroup>
            {visibleSpecs.map((spec) => (
              <col
                key={spec.id}
                data-col-id={spec.id}
                style={{ width: getWidthPx(spec.id) }}
              />
            ))}
            <col data-col-id="__actions__" style={{ width: actionsWidthPx }} />
          </colgroup>
          <thead
            className={
              virtualized
                ? "sticky top-0 z-[1] bg-content1 shadow-[0_1px_0_rgba(0,0,0,0.06)]"
                : undefined
            }
          >
            <tr>
              {visibleSpecs.map((spec) => {
                const sortable = sortableColumnIds.has(spec.id);
                const isActive = sort?.columnId === spec.id;
                return (
                  <EditorResizableTh
                    key={spec.id}
                    label={spec.label}
                    widthPx={getWidthPx(spec.id)}
                    onResizeStart={(clientX) =>
                      startResize(spec.id, clientX, tableRef.current)
                    }
                    sortable={sortable}
                    sortDirection={isActive ? sort!.direction : null}
                    onSortToggle={sortable ? () => toggleSort(spec.id) : undefined}
                  />
                );
              })}
              <EditorActionsTh widthPx={actionsWidthPx} />
            </tr>
          </thead>
          <tbody>
            {virtualized && topPad > 0 ? (
              <tr style={{ height: topPad }} aria-hidden>
                <td colSpan={visibleSpecs.length + 1} />
              </tr>
            ) : null}
            {visibleSlice.map((row, i) => {
              const rowIndex = startIndex + i;
              const rowKey = getRowKey(row, rowIndex);
              const cls =
                getRowClassNameRef.current?.(row, rowIndex) ?? "border-t border-default-200";
              const rowId = getRowIdRef.current?.(row, rowIndex);
              return (
                <EditorRow
                  key={rowKey}
                  row={row}
                  rowIndex={rowIndex}
                  rowId={rowId}
                  className={cls}
                  visibleSpecs={rowSpecList}
                  actionsWidthPx={actionsWidthPx}
                  renderCell={stableRenderCell}
                  renderActions={stableRenderActions}
                  virtualized={virtualized}
                />
              );
            })}
            {virtualized && bottomPad > 0 ? (
              <tr style={{ height: bottomPad }} aria-hidden>
                <td colSpan={visibleSpecs.length + 1} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

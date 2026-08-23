"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type UIEvent,
} from "react";

import { EditorColumnPicker } from "./EditorColumnPicker";
import {
  EditorActionsTh,
  EditorResizableTh,
  EDITOR_HEADER_HEIGHT_PX,
} from "./EditorResizableTh";
import { applyEditorColumnSort, type EditorColumnSortDef } from "./editorSort";
import type { EditorColumnPreset, EditorColumnSpec } from "./useEditorColumnVisibility";
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
  /** Optional presets when the table owns its own column picker. */
  columnPresets?: EditorColumnPreset[];
};

/** Fixed row height keeps freeze panes aligned and enables windowing. */
const ROW_HEIGHT_PX = 44;
const VIRT_OVERSCAN = 8;
/** Rows beyond this get virtualized inside a scrollable viewport. */
const VIRT_THRESHOLD = 60;
/** Cap on the viewport height for the virtualized scroll area. */
const VIRT_VIEWPORT_MAX_PX = 720;

const TABLE_CLASS = "table-fixed border-separate border-spacing-0";
const HEADER_BAR_CLASS =
  "sticky top-0 z-[2] flex w-full min-w-0 items-stretch bg-content1 shadow-[0_1px_0_rgba(0,0,0,0.06)]";
const HEADER_TR_STYLE = { height: EDITOR_HEADER_HEIGHT_PX } as const;
const BODY_TR_STYLE = {
  height: ROW_HEIGHT_PX,
  maxHeight: ROW_HEIGHT_PX,
} as const;
const BODY_TD_CLASS =
  "box-border h-11 max-h-11 overflow-hidden border-t border-default-200 py-0 pl-2.5 pr-1.5 align-middle min-w-0";
const ACTIONS_TD_CLASS =
  "box-border h-11 max-h-11 overflow-hidden whitespace-nowrap border-t border-default-200 py-0 pl-3.5 pr-1.5 align-middle min-w-0";
/** Mid header scrollport: hide scrollbar; body mid owns the visible horizontal scrollbar. */
const MID_HEAD_SCROLL_CLASS =
  "min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";
const MID_BODY_SCROLL_CLASS =
  "min-w-0 flex-1 overflow-x-auto overscroll-x-contain [overflow-anchor:none]";
/** Dotted seam between locked left columns and the scrollable middle. */
const FREEZE_EDGE_LEFT_CLASS =
  "shrink-0 bg-content1 border-r border-dotted border-slate-300";
/** Dotted seam between the scrollable middle and locked Actions. */
const FREEZE_EDGE_RIGHT_CLASS =
  "shrink-0 bg-content1 border-l border-dotted border-slate-300";

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

type ColSpec = { id: string; label: string };

type PaneRowProps<TRow> = {
  row: TRow;
  rowIndex: number;
  rowId?: string;
  className: string;
  specs: ColSpec[];
  renderCell: (columnId: string, row: TRow, index: number) => ReactNode;
  renderActions?: (row: TRow, index: number) => ReactNode;
  actionsWidthPx?: number;
};

function PaneRowInner<TRow>({
  row,
  rowIndex,
  rowId,
  className,
  specs,
  renderCell,
  renderActions,
  actionsWidthPx,
}: PaneRowProps<TRow>) {
  return (
    <tr id={rowId} className={className} style={BODY_TR_STYLE}>
      {specs.map((spec) => (
        <td key={spec.id} className={BODY_TD_CLASS}>
          {renderCell(spec.id, row, rowIndex)}
        </td>
      ))}
      {renderActions && actionsWidthPx != null ? (
        <td
          className={ACTIONS_TD_CLASS}
          style={{
            width: actionsWidthPx,
            minWidth: actionsWidthPx,
            maxWidth: actionsWidthPx,
          }}
        >
          {renderActions(row, rowIndex)}
        </td>
      ) : null}
    </tr>
  );
}

const PaneRow = memo(PaneRowInner) as typeof PaneRowInner;

function SpacerRow({ height, colSpan }: { height: number; colSpan: number }) {
  if (height <= 0) return null;
  return (
    <tr style={{ height }} aria-hidden>
      <td colSpan={colSpan} />
    </tr>
  );
}

function ColGroup({
  specs,
  getWidthPx,
  actionsWidthPx,
}: {
  specs: EditorColumnSpec[];
  getWidthPx: (id: string) => number;
  actionsWidthPx?: number;
}) {
  return (
    <colgroup>
      {specs.map((spec) => (
        <col
          key={spec.id}
          data-col-id={spec.id}
          style={{ width: getWidthPx(spec.id) }}
        />
      ))}
      {actionsWidthPx != null ? (
        <col data-col-id="__actions__" style={{ width: actionsWidthPx }} />
      ) : null}
    </colgroup>
  );
}

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
  columnPresets,
}: EditorConfigurableTableProps<TRow>) {
  const leftHeadTableRef = useRef<HTMLTableElement>(null);
  const leftBodyTableRef = useRef<HTMLTableElement>(null);
  const midHeadTableRef = useRef<HTMLTableElement>(null);
  const midBodyTableRef = useRef<HTMLTableElement>(null);
  const rightHeadTableRef = useRef<HTMLTableElement>(null);
  const rightBodyTableRef = useRef<HTMLTableElement>(null);
  const midHeadScrollRef = useRef<HTMLDivElement>(null);
  const midBodyScrollRef = useRef<HTMLDivElement>(null);
  const vScrollRef = useRef<HTMLDivElement>(null);
  const syncingMidScroll = useRef(false);

  const internalVisibility = useEditorColumnVisibility(
    editorKey,
    columnSpecs,
    columnPresets,
  );
  const {
    specs,
    visibleSpecs,
    visibleIds,
    presets,
    toggleColumn,
    showAllColumns,
    hideAllColumns,
    applyPreset,
  } = visibility ?? internalVisibility;
  const {
    containerRef,
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

  const pinnedSpecs = useMemo(
    () => visibleSpecs.filter((s) => s.pinned === "left"),
    [visibleSpecs],
  );
  const scrollSpecs = useMemo(
    () => visibleSpecs.filter((s) => s.pinned !== "left"),
    [visibleSpecs],
  );

  const pinnedColList = useMemo<ColSpec[]>(
    () => pinnedSpecs.map((s) => ({ id: s.id, label: s.label })),
    [pinnedSpecs],
  );
  const scrollColList = useMemo<ColSpec[]>(
    () => scrollSpecs.map((s) => ({ id: s.id, label: s.label })),
    [scrollSpecs],
  );

  const pinnedWidthPx = useMemo(
    () => pinnedSpecs.reduce((sum, s) => sum + getWidthPx(s.id), 0),
    [pinnedSpecs, getWidthPx],
  );
  const scrollWidthPx = useMemo(
    () => scrollSpecs.reduce((sum, s) => sum + getWidthPx(s.id), 0),
    [scrollSpecs, getWidthPx],
  );

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

  const resizeTables = useCallback(
    () => [
      leftHeadTableRef.current,
      leftBodyTableRef.current,
      midHeadTableRef.current,
      midBodyTableRef.current,
      rightHeadTableRef.current,
      rightBodyTableRef.current,
    ],
    [],
  );

  const syncMidScroll = useCallback((source: "head" | "body", left: number) => {
    if (syncingMidScroll.current) return;
    syncingMidScroll.current = true;
    const target =
      source === "head" ? midBodyScrollRef.current : midHeadScrollRef.current;
    if (target && target.scrollLeft !== left) {
      target.scrollLeft = left;
    }
    syncingMidScroll.current = false;
  }, []);

  const onMidHeadScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      syncMidScroll("head", e.currentTarget.scrollLeft);
    },
    [syncMidScroll],
  );
  const onMidBodyScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      syncMidScroll("body", e.currentTarget.scrollLeft);
    },
    [syncMidScroll],
  );

  const virtualized = displayRows.length > VIRT_THRESHOLD;

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    if (!virtualized) {
      setScrollTop(0);
      return;
    }
    const el = vScrollRef.current;
    if (!el) return;
    const measure = () => setViewportHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [virtualized]);

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
    const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - VIRT_OVERSCAN);
    const last = Math.min(
      displayRows.length,
      Math.ceil((scrollTop + vh) / ROW_HEIGHT_PX) + VIRT_OVERSCAN,
    );
    return {
      startIndex: first,
      endIndex: last,
      topPad: first * ROW_HEIGHT_PX,
      bottomPad: Math.max(0, (displayRows.length - last) * ROW_HEIGHT_PX),
    };
  }, [virtualized, viewportHeight, scrollTop, displayRows.length]);

  const scrollRaf = useRef(0);
  const handleVScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      if (!virtualized) return;
      const y = e.currentTarget.scrollTop;
      cancelAnimationFrame(scrollRaf.current);
      scrollRaf.current = requestAnimationFrame(() => {
        setScrollTop((prev) => (prev === y ? prev : y));
      });
    },
    [virtualized],
  );

  useEffect(
    () => () => {
      cancelAnimationFrame(scrollRaf.current);
    },
    [],
  );

  const visibleSlice = useMemo(
    () => displayRows.slice(startIndex, endIndex),
    [displayRows, startIndex, endIndex],
  );

  const pickerPresets = visibility?.presets?.length
    ? visibility.presets
    : presets;

  const renderHeaderCells = (paneSpecs: EditorColumnSpec[]) =>
    paneSpecs.map((spec) => {
      const sortable = sortableColumnIds.has(spec.id);
      const isActive = sort?.columnId === spec.id;
      return (
        <EditorResizableTh
          key={spec.id}
          label={spec.label}
          widthPx={getWidthPx(spec.id)}
          onResizeStart={(clientX) =>
            startResize(spec.id, clientX, resizeTables())
          }
          sortable={sortable}
          sortDirection={isActive ? sort!.direction : null}
          onSortToggle={sortable ? () => toggleSort(spec.id) : undefined}
        />
      );
    });

  const renderBodyRows = (opts: {
    colList: ColSpec[];
    withActions?: boolean;
    attachRowId?: boolean;
  }) => (
    <>
      <SpacerRow
        height={topPad}
        colSpan={opts.colList.length + (opts.withActions ? 1 : 0)}
      />
      {visibleSlice.map((row, i) => {
        const rowIndex = startIndex + i;
        const rowKey = getRowKey(row, rowIndex);
        const cls =
          getRowClassNameRef.current?.(row, rowIndex) ?? "border-t border-default-200";
        const rowId = opts.attachRowId
          ? getRowIdRef.current?.(row, rowIndex)
          : undefined;
        return (
          <PaneRow
            key={rowKey}
            row={row}
            rowIndex={rowIndex}
            rowId={rowId}
            className={cls}
            specs={opts.colList}
            renderCell={stableRenderCell}
            renderActions={opts.withActions ? stableRenderActions : undefined}
            actionsWidthPx={opts.withActions ? actionsWidthPx : undefined}
          />
        );
      })}
      <SpacerRow
        height={bottomPad}
        colSpan={opts.colList.length + (opts.withActions ? 1 : 0)}
      />
    </>
  );

  const leftStyle: CSSProperties = {
    width: pinnedWidthPx,
    minWidth: pinnedWidthPx,
  };
  const midStyle: CSSProperties = {
    width: Math.max(scrollWidthPx, 1),
    minWidth: Math.max(scrollWidthPx, 1),
  };
  const rightStyle: CSSProperties = {
    width: actionsWidthPx,
    minWidth: actionsWidthPx,
  };

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
            presets={pickerPresets}
            onApplyPreset={pickerPresets.length ? applyPreset : undefined}
          />
        </div>
      )}
      <div ref={containerRef} className="w-full min-w-0">
        <div
          ref={vScrollRef}
          className="w-full min-w-0 max-h-[min(720px,calc(100dvh-14rem))] overflow-y-auto overscroll-contain [overflow-anchor:none]"
          onScroll={virtualized ? handleVScroll : undefined}
        >
          {/* Sticky header strip — outside overflow-x so vertical stickiness works */}
          <div className={HEADER_BAR_CLASS}>
            {pinnedSpecs.length > 0 ? (
              <div className={FREEZE_EDGE_LEFT_CLASS} style={leftStyle}>
                <table
                  ref={leftHeadTableRef}
                  className={TABLE_CLASS}
                  style={leftStyle}
                >
                  <ColGroup specs={pinnedSpecs} getWidthPx={getWidthPx} />
                  <thead>
                    <tr style={HEADER_TR_STYLE}>{renderHeaderCells(pinnedSpecs)}</tr>
                  </thead>
                </table>
              </div>
            ) : null}

            <div
              ref={midHeadScrollRef}
              className={MID_HEAD_SCROLL_CLASS}
              onScroll={onMidHeadScroll}
            >
              {scrollSpecs.length > 0 ? (
                <table
                  ref={midHeadTableRef}
                  className={TABLE_CLASS}
                  style={midStyle}
                >
                  <ColGroup specs={scrollSpecs} getWidthPx={getWidthPx} />
                  <thead>
                    <tr style={HEADER_TR_STYLE}>{renderHeaderCells(scrollSpecs)}</tr>
                  </thead>
                </table>
              ) : (
                <div style={{ height: EDITOR_HEADER_HEIGHT_PX }} aria-hidden />
              )}
            </div>

            <div className={FREEZE_EDGE_RIGHT_CLASS} style={rightStyle}>
              <table
                ref={rightHeadTableRef}
                className={TABLE_CLASS}
                style={rightStyle}
              >
                <ColGroup specs={[]} getWidthPx={getWidthPx} actionsWidthPx={actionsWidthPx} />
                <thead>
                  <tr style={HEADER_TR_STYLE}>
                    <EditorActionsTh widthPx={actionsWidthPx} />
                  </tr>
                </thead>
              </table>
            </div>
          </div>

          {/* Body strip */}
          <div className="flex w-full min-w-0 items-start">
            {pinnedSpecs.length > 0 ? (
              <div className={FREEZE_EDGE_LEFT_CLASS} style={leftStyle}>
                <table
                  ref={leftBodyTableRef}
                  className={TABLE_CLASS}
                  style={leftStyle}
                >
                  <ColGroup specs={pinnedSpecs} getWidthPx={getWidthPx} />
                  <tbody>
                    {renderBodyRows({
                      colList: pinnedColList,
                      attachRowId: true,
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div
              ref={midBodyScrollRef}
              className={MID_BODY_SCROLL_CLASS}
              onScroll={onMidBodyScroll}
            >
              {scrollSpecs.length > 0 ? (
                <table
                  ref={midBodyTableRef}
                  className={TABLE_CLASS}
                  style={midStyle}
                >
                  <ColGroup specs={scrollSpecs} getWidthPx={getWidthPx} />
                  <tbody>
                    {renderBodyRows({
                      colList: scrollColList,
                      attachRowId: pinnedSpecs.length === 0,
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="h-[1px] w-full" aria-hidden />
              )}
            </div>

            <div className={FREEZE_EDGE_RIGHT_CLASS} style={rightStyle}>
              <table
                ref={rightBodyTableRef}
                className={TABLE_CLASS}
                style={rightStyle}
              >
                <ColGroup specs={[]} getWidthPx={getWidthPx} actionsWidthPx={actionsWidthPx} />
                <tbody>
                  <SpacerRow height={topPad} colSpan={1} />
                  {visibleSlice.map((row, i) => {
                    const rowIndex = startIndex + i;
                    const rowKey = getRowKey(row, rowIndex);
                    const cls =
                      getRowClassNameRef.current?.(row, rowIndex) ??
                      "border-t border-default-200";
                    return (
                      <PaneRow
                        key={rowKey}
                        row={row}
                        rowIndex={rowIndex}
                        className={cls}
                        specs={[]}
                        renderCell={stableRenderCell}
                        renderActions={stableRenderActions}
                        actionsWidthPx={actionsWidthPx}
                      />
                    );
                  })}
                  <SpacerRow height={bottomPad} colSpan={1} />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

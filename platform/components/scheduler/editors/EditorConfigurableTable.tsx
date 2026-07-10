"use client";

import { useMemo, useRef, type ReactNode } from "react";

import { EditorColumnPicker } from "./EditorColumnPicker";
import { EditorActionsTh, EditorResizableTh } from "./EditorResizableTh";
import { editorTd } from "./EditorTableShell";
import { applyEditorColumnSort, type EditorColumnSortDef } from "./editorSort";
import type { EditorColumnSpec } from "./useEditorColumnVisibility";
import { useEditorColumnVisibility } from "./useEditorColumnVisibility";
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
};

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
}: EditorConfigurableTableProps<TRow>) {
  const tableRef = useRef<HTMLTableElement>(null);
  const { specs, visibleSpecs, visibleIds, toggleColumn, showAllColumns, hideAllColumns } =
    useEditorColumnVisibility(editorKey, columnSpecs);
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

  const tableStyle =
    containerWidth > 0
      ? {
          width: containerWidth,
          minWidth: containerWidth,
          maxWidth: containerWidth,
        }
      : { width: "100%" };

  return (
    <>
      <EditorColumnPicker
        editorKey={editorKey}
        specs={specs}
        visibleIds={visibleIds}
        onToggle={toggleColumn}
        onShowAll={showAllColumns}
        onHideAll={hideAllColumns}
      />
      <div ref={containerRef} className="w-full min-w-0 overflow-hidden">
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
          <thead>
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
            {displayRows.map((row, index) => (
              <tr
                key={getRowKey(row, index)}
                id={getRowId?.(row, index)}
                className={getRowClassName?.(row, index) ?? "border-t border-default-200"}
              >
                {visibleSpecs.map((spec) => (
                  <td key={spec.id} className={editorTd}>
                    {renderCell(spec.id, row, index)}
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
                  {renderActions(row, index)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

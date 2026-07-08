"use client";

import { useRef, type ReactNode } from "react";

import { EditorColumnPicker } from "./EditorColumnPicker";
import { EditorActionsTh, EditorResizableTh } from "./EditorResizableTh";
import { editorTd } from "./EditorTableShell";
import type { EditorColumnSpec } from "./useEditorColumnVisibility";
import { useEditorColumnVisibility } from "./useEditorColumnVisibility";
import { useEditorColumnWidths } from "./useEditorColumnWidths";

type EditorConfigurableTableProps<TRow> = {
  editorKey: string;
  columnSpecs: EditorColumnSpec[];
  rows: TRow[];
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
  getRowKey,
  getRowId,
  getRowClassName,
  renderCell,
  renderActions,
}: EditorConfigurableTableProps<TRow>) {
  const tableRef = useRef<HTMLTableElement>(null);
  const { specs, visibleSpecs, visibleIds, toggleColumn } =
    useEditorColumnVisibility(editorKey, columnSpecs);
  const {
    containerRef,
    containerWidth,
    getWidthPx,
    actionsWidthPx,
    startResize,
  } = useEditorColumnWidths(editorKey, visibleSpecs);

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
              {visibleSpecs.map((spec) => (
                <EditorResizableTh
                  key={spec.id}
                  label={spec.label}
                  widthPx={getWidthPx(spec.id)}
                  onResizeStart={(clientX) =>
                    startResize(spec.id, clientX, tableRef.current)
                  }
                />
              ))}
              <EditorActionsTh widthPx={actionsWidthPx} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
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

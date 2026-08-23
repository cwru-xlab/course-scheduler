"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import clsx from "clsx";
import type { CSSProperties } from "react";

import type { SortDirection } from "./editorSort";

/** Must match HEADER_HEIGHT_PX in EditorConfigurableTable (freeze-pane alignment). */
export const EDITOR_HEADER_HEIGHT_PX = 36;

type EditorResizableThProps = {
  label: string;
  widthPx: number;
  onResizeStart: (clientX: number) => void;
  resizable?: boolean;
  sortable?: boolean;
  sortDirection?: SortDirection | null;
  onSortToggle?: () => void;
};

function ColumnRightEdge({
  resizable,
  label,
  onResizeStart,
}: {
  resizable: boolean;
  label: string;
  onResizeStart?: (clientX: number) => void;
}) {
  return (
    <>
      <span
        className="pointer-events-none absolute right-0 top-1 bottom-1 z-[1] w-px bg-slate-300"
        aria-hidden
      />
      {resizable ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label} column`}
          title={`Drag to resize ${label} column`}
          className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-slate-100/90 active:bg-slate-200/90"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onResizeStart?.(e.clientX);
          }}
        />
      ) : null}
    </>
  );
}

const headerThClass =
  "relative box-border overflow-hidden bg-content1 px-0 text-xs font-semibold uppercase tracking-wide text-default-500";

export function EditorResizableTh({
  label,
  widthPx,
  onResizeStart,
  resizable = true,
  sortable = false,
  sortDirection = null,
  onSortToggle,
}: EditorResizableThProps) {
  const sortTitle = sortable
    ? sortDirection === "asc"
      ? `Sorted A→Z. Click for Z→A.`
      : sortDirection === "desc"
        ? `Sorted Z→A. Click to clear sort.`
        : `Click to sort A→Z`
    : undefined;

  const style: CSSProperties = {
    width: widthPx,
    minWidth: widthPx,
    maxWidth: widthPx,
    height: EDITOR_HEADER_HEIGHT_PX,
    maxHeight: EDITOR_HEADER_HEIGHT_PX,
  };

  return (
    <th className={headerThClass} style={style} title={label}>
      {sortable ? (
        <button
          type="button"
          className="flex h-full w-full min-w-0 items-center gap-1 pl-2.5 pr-3 text-left hover:text-slate-900"
          onClick={onSortToggle}
          title={sortTitle ?? label}
          aria-label={`${label}${sortDirection ? `, sorted ${sortDirection === "asc" ? "A to Z" : "Z to A"}` : ""}`}
        >
          <span className="min-w-0 truncate">{label}</span>
          <span className="shrink-0 text-slate-400" aria-hidden>
            {sortDirection === "asc" ? (
              <ArrowUp className="size-3.5" />
            ) : sortDirection === "desc" ? (
              <ArrowDown className="size-3.5" />
            ) : (
              <ArrowUpDown className="size-3.5 opacity-40" />
            )}
          </span>
        </button>
      ) : (
        <span className="flex h-full items-center truncate pl-2.5 pr-3" title={label}>
          {label}
        </span>
      )}
      <ColumnRightEdge
        resizable={resizable}
        label={label}
        onResizeStart={resizable ? onResizeStart : undefined}
      />
    </th>
  );
}

/** Fixed-width actions column (not resizable). */
export function EditorActionsTh({ widthPx }: { widthPx: number }) {
  return (
    <th
      className={clsx(headerThClass)}
      style={{
        width: widthPx,
        minWidth: widthPx,
        maxWidth: widthPx,
        height: EDITOR_HEADER_HEIGHT_PX,
        maxHeight: EDITOR_HEADER_HEIGHT_PX,
      }}
    >
      <span className="flex h-full items-center truncate pl-3.5 pr-1">Actions</span>
    </th>
  );
}

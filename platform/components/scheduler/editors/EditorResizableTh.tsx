"use client";

import { editorTh } from "./EditorTableShell";

type EditorResizableThProps = {
  label: string;
  widthPx: number;
  onResizeStart: (clientX: number) => void;
  resizable?: boolean;
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

export function EditorResizableTh({
  label,
  widthPx,
  onResizeStart,
  resizable = true,
}: EditorResizableThProps) {
  return (
    <th
      className={`${editorTh} relative overflow-hidden`}
      style={{ width: widthPx, minWidth: widthPx, maxWidth: widthPx }}
    >
      <span className="block truncate pl-2.5 pr-3">{label}</span>
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
      className={`${editorTh} relative overflow-hidden`}
      style={{
        width: widthPx,
        minWidth: widthPx,
        maxWidth: widthPx,
      }}
    >
      <span className="block truncate pl-2.5 pr-1">Actions</span>
    </th>
  );
}

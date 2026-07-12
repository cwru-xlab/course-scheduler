"use client";

type ReadOnlyIdCellProps = {
  value: string | number;
  title?: string;
};

/** Non-editable ID column: same typography as editable cells, subtle static background. */
export function ReadOnlyIdCell({ value, title }: ReadOnlyIdCellProps) {
  const text = String(value);
  return (
    <span
      className="block truncate rounded-sm bg-slate-50/80 px-1 py-0.5 text-slate-700 cursor-default select-text"
      title={title ?? `${text} (read-only)`}
      aria-readonly="true"
    >
      {text}
    </span>
  );
}

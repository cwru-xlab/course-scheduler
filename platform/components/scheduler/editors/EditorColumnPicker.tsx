"use client";

import type { EditorColumnSpec } from "./useEditorColumnVisibility";

type EditorColumnPickerProps = {
  specs: EditorColumnSpec[];
  visibleIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
};

export function EditorColumnPicker({
  specs,
  visibleIds,
  onToggle,
}: EditorColumnPickerProps) {
  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Show columns inline
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {specs.map((spec) => (
          <label
            key={spec.id}
            className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-700"
          >
            <input
              type="checkbox"
              className="size-3.5 rounded border-slate-300 text-primary accent-[#137fec]"
              checked={visibleIds.has(spec.id)}
              onChange={(e) => onToggle(spec.id, e.target.checked)}
            />
            <span>{spec.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

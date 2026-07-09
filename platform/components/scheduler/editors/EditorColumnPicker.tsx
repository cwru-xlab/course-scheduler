"use client";

import { ChevronDown, ChevronRight } from "lucide-react";

import { useShowColumnsInlineExpanded } from "@/lib/editor-ui-preferences";
import type { EditorColumnSpec } from "./useEditorColumnVisibility";

type EditorColumnPickerProps = {
  editorKey: string;
  specs: EditorColumnSpec[];
  visibleIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
};

export function EditorColumnPicker({
  editorKey,
  specs,
  visibleIds,
  onToggle,
}: EditorColumnPickerProps) {
  const [isExpanded, setIsExpanded] = useShowColumnsInlineExpanded(editorKey);

  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/80">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-100/60"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Show columns inline
        </span>
        {isExpanded ? (
          <ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden />
        )}
      </button>
      {isExpanded && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-200/80 px-3 pb-2.5 pt-2">
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
      )}
    </div>
  );
}

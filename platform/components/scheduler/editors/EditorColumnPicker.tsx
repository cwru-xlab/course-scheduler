"use client";

import clsx from "clsx";
import { ChevronDown, ChevronRight } from "lucide-react";

import { useShowColumnsInlineExpanded } from "@/lib/editor-ui-preferences";
import type { EditorColumnSpec } from "./useEditorColumnVisibility";

type EditorColumnPickerProps = {
  editorKey: string;
  specs: EditorColumnSpec[];
  visibleIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  onShowAll: () => void;
  onHideAll: () => void;
};

export function EditorColumnPicker({
  editorKey,
  specs,
  visibleIds,
  onToggle,
  onShowAll,
  onHideAll,
}: EditorColumnPickerProps) {
  const [isExpanded, setIsExpanded] = useShowColumnsInlineExpanded(editorKey);
  const visibleCount = specs.filter((spec) => visibleIds.has(spec.id)).length;

  return (
    <div className="mb-3 rounded-lg border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Columns
          </span>
          <span className="text-[11px] font-medium text-slate-400">
            {visibleCount}/{specs.length}
          </span>
        </span>
        {isExpanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-slate-400" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-slate-400" aria-hidden />
        )}
      </button>
      {isExpanded && (
        <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 px-2.5 py-2">
          <button
            type="button"
            className="h-6 shrink-0 rounded-md px-1.5 text-[10px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-weatherhead-primary"
            onClick={onShowAll}
          >
            All
          </button>
          <button
            type="button"
            title="Hide optional columns (keeps ID visible)"
            className="h-6 shrink-0 rounded-md px-1.5 text-[10px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-weatherhead-primary"
            onClick={onHideAll}
          >
            None
          </button>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200" aria-hidden />
          {specs.map((spec) => {
            const isVisible = visibleIds.has(spec.id);
            return (
              <button
                key={spec.id}
                type="button"
                role="checkbox"
                aria-checked={isVisible}
                aria-label={`${isVisible ? "Hide" : "Show"} ${spec.label} column`}
                onClick={() => onToggle(spec.id, !isVisible)}
                className={clsx(
                  "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-md border px-2 text-[10px] font-medium leading-none transition-colors",
                  isVisible
                    ? "border-sky-200/90 bg-sky-50 text-weatherhead-primary"
                    : "border-slate-200/80 bg-slate-50/40 text-slate-500 hover:border-slate-300 hover:bg-white",
                )}
              >
                {spec.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";

import type { EditorColumnSpec } from "./useEditorColumnVisibility";

type EditorColumnPickerProps = {
  specs: EditorColumnSpec[];
  visibleIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  onShowAll: () => void;
  onHideAll: () => void;
};

export function EditorColumnPicker({
  specs,
  visibleIds,
  onToggle,
  onShowAll,
  onHideAll,
}: EditorColumnPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const visibleCount = specs.filter((spec) => visibleIds.has(spec.id)).length;

  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <span className="uppercase tracking-wider text-[10px] text-slate-500">Columns</span>
        <span className="text-slate-400">
          {visibleCount}/{specs.length}
        </span>
        <ChevronDown
          className={clsx(
            "size-3.5 text-slate-400 transition-transform",
            isOpen && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {isOpen && (
        <>
          <button
            type="button"
            className="h-6 shrink-0 rounded-md px-2 text-[10px] font-semibold text-slate-600 transition-colors hover:bg-slate-100"
            onClick={onShowAll}
          >
            All
          </button>
          <button
            type="button"
            title="Hide optional columns (keeps ID visible)"
            className="h-6 shrink-0 rounded-md px-2 text-[10px] font-semibold text-slate-600 transition-colors hover:bg-slate-100"
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
        </>
      )}
    </div>
  );
}

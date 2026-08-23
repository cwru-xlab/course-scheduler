"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@heroui/popover";

import {
  navbarPopoverProps,
  toolbarChipPopoverChipClass,
  toolbarChipPopoverContentClass,
  toolbarChipPopoverGridClass,
  toolbarChipPopoverGridStyle,
} from "@/lib/ui/navbarPopoverProps";
import type { EditorColumnPreset, EditorColumnSpec } from "./useEditorColumnVisibility";

type EditorColumnPickerProps = {
  specs: EditorColumnSpec[];
  visibleIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  /** When set, show Essentials / Scheduling / All style presets instead of only All/None. */
  presets?: EditorColumnPreset[];
  onApplyPreset?: (presetId: string) => void;
};

export function EditorColumnPicker({
  specs,
  visibleIds,
  onToggle,
  onShowAll,
  onHideAll,
  presets,
  onApplyPreset,
}: EditorColumnPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const visibleCount = specs.filter((spec) => visibleIds.has(spec.id)).length;
  const hasPresets = Boolean(presets && presets.length > 0 && onApplyPreset);

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      placement="bottom-start"
      {...navbarPopoverProps}
    >
      <PopoverTrigger>
        <button
          type="button"
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
      </PopoverTrigger>
      <PopoverContent className={toolbarChipPopoverContentClass}>
        <div
          className="space-y-2.5 p-3"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap items-center gap-1">
            {hasPresets ? (
              presets!.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="h-6 shrink-0 rounded-md px-2 text-[10px] font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                  onClick={() => onApplyPreset!(preset.id)}
                >
                  {preset.label}
                </button>
              ))
            ) : (
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
              </>
            )}
          </div>
          <div className="h-px bg-slate-100" aria-hidden />
          <div
            className={toolbarChipPopoverGridClass}
            style={toolbarChipPopoverGridStyle(specs.length)}
          >
            {specs.map((spec) => {
              const isVisible = visibleIds.has(spec.id);
              return (
                <button
                  key={spec.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isVisible}
                  aria-label={`${isVisible ? "Hide" : "Show"} ${spec.label} column`}
                  title={spec.label}
                  onClick={() => onToggle(spec.id, !isVisible)}
                  className={clsx(
                    toolbarChipPopoverChipClass,
                    isVisible
                      ? "border-sky-200/90 bg-sky-50 text-weatherhead-primary"
                      : "border-slate-200/80 bg-slate-50/40 text-slate-500 hover:border-slate-300 hover:bg-white",
                  )}
                >
                  <span className="truncate">{spec.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

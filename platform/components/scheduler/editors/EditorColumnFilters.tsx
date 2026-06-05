"use client";

import { useMemo, useState } from "react";
import { Button } from "@heroui/button";
import { Select, SelectItem } from "@heroui/select";

import {
  EDITOR_SELECT_ITEM_CLASS_NAMES,
  EDITOR_SELECT_TRIGGER_CLASS_NAMES,
  editorSelectListboxProps,
  editorSelectPopoverProps,
  menuMinWidthForOptions,
} from "../editorDropdownWidth";
import { EditableSelectCell } from "../EditableSelectCell";
import { MultiSelect } from "../MultiSelect";
import { EditorModalShell } from "./EditorModalShell";
import {
  countActiveColumnFilters,
  getFilterOptionsForDef,
  isColumnFilterActive,
  NUMBER_COMPARE_OPTIONS,
  TIME_COMPARE_OPTIONS,
  type ColumnFilterState,
  type EditorColumnFilterDef,
  type EditorFiltersState,
  type NumberCompareOp,
  type TimeCompareOp,
} from "./editorFilters";

const controlClass =
  "h-8 max-w-full rounded-lg border border-default-200 bg-white px-2 text-xs text-slate-800 outline-none focus:border-primary dark:bg-default-100";

type EditorColumnFiltersProps<TRow> = {
  defs: EditorColumnFilterDef<TRow>[];
  rows: TRow[];
  filters: EditorFiltersState;
  onChange: (filters: EditorFiltersState) => void;
};

type FilterRowProps<TRow> = {
  def: EditorColumnFilterDef<TRow>;
  options: { key: string; label: string }[];
  state: ColumnFilterState;
  onChange: (patch: Partial<ColumnFilterState>) => void;
};

function FilterRow<TRow>({ def, options, state, onChange }: FilterRowProps<TRow>) {
  switch (def.control.kind) {
    case "multiSearch":
    case "multiSelect":
      return (
        <MultiSelect
          value={state.values ?? []}
          options={options}
          onChange={(values) => onChange({ values })}
          placeholder={`Any ${def.label.toLowerCase()}…`}
          showSearch={def.control.kind === "multiSearch" || def.control.showSearch !== false}
        />
      );

    case "numberCompare":
      return (
        <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-hidden">
          <select
            className={`${controlClass} min-w-0 max-w-full sm:min-w-[10rem]`}
            value={state.numberOp ?? ""}
            onChange={(e) =>
              onChange({ numberOp: (e.target.value || undefined) as NumberCompareOp | undefined })
            }
            aria-label={`${def.label} comparison`}
          >
            <option value="">Any…</option>
            {NUMBER_COMPARE_OPTIONS.map((op) => (
              <option key={op.key} value={op.key}>
                {op.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            className={`${controlClass} w-28`}
            value={state.numberValue ?? ""}
            onChange={(e) => onChange({ numberValue: e.target.value })}
            placeholder="Value"
            aria-label={`${def.label} value`}
          />
        </div>
      );

    case "timeCompare":
      return (
        <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-hidden">
          <select
            className={`${controlClass} min-w-0 shrink-0 sm:min-w-[6.5rem]`}
            value={state.timeOp ?? ""}
            onChange={(e) =>
              onChange({ timeOp: (e.target.value || undefined) as TimeCompareOp | undefined })
            }
            aria-label={`${def.label} comparison`}
          >
            <option value="">Any…</option>
            {TIME_COMPARE_OPTIONS.map((op) => (
              <option key={op.key} value={op.key}>
                {op.label}
              </option>
            ))}
          </select>
          <div className="min-w-0 flex-1 overflow-hidden">
            <EditableSelectCell
              value={state.timeValue ?? ""}
              options={options}
              onChange={(v) => onChange({ timeValue: v })}
              placeholder="Select time…"
              isSearchable
            />
          </div>
        </div>
      );

    case "singleSelect": {
      const menuMinWidth = menuMinWidthForOptions(options);
      return (
        <Select
          size="sm"
          selectedKeys={state.singleValue ? [state.singleValue] : []}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0] as string | undefined;
            onChange({ singleValue: selected ?? "" });
          }}
          placeholder={`Any ${def.label.toLowerCase()}…`}
          aria-label={def.label}
          className="w-full min-w-0 max-w-full"
          classNames={EDITOR_SELECT_TRIGGER_CLASS_NAMES}
          popoverProps={editorSelectPopoverProps(menuMinWidth)}
          listboxProps={editorSelectListboxProps(menuMinWidth)}
        >
          {options.map((option) => (
            <SelectItem
              key={option.key}
              textValue={option.label}
              classNames={EDITOR_SELECT_ITEM_CLASS_NAMES}
            >
              {option.label}
            </SelectItem>
          ))}
        </Select>
      );
    }

    default:
      return null;
  }
}

function EditorFilterPanel<TRow>({
  defs,
  rows,
  filters,
  onChange,
}: EditorColumnFiltersProps<TRow>) {
  const optionsByColumnId = useMemo(() => {
    const map = new Map<string, { key: string; label: string }[]>();
    for (const def of defs) {
      map.set(def.columnId, getFilterOptionsForDef(def, rows));
    }
    return map;
  }, [defs, rows]);

  const updateColumn = (columnId: string, patch: Partial<ColumnFilterState>) => {
    onChange({
      ...filters,
      [columnId]: { ...filters[columnId], ...patch },
    });
  };

  const clearColumn = (columnId: string) => {
    const next = { ...filters };
    delete next[columnId];
    onChange(next);
  };

  return (
    <div className="space-y-2 overflow-x-hidden">
      {defs.map((def) => {
        const state = filters[def.columnId] ?? {};
        const isActive = isColumnFilterActive(def, state);

        return (
          <div
            key={def.columnId}
            className="grid grid-cols-1 items-center gap-2 rounded-lg border border-default-200 bg-default-50/60 px-3 py-2 sm:grid-cols-[7rem_1fr_auto]"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-default-600">
              {def.label}
            </span>
            <div className="min-w-0 overflow-hidden">
              <FilterRow
                def={def}
                options={optionsByColumnId.get(def.columnId) ?? []}
                state={state}
                onChange={(patch) => updateColumn(def.columnId, patch)}
              />
            </div>
            <Button
              size="sm"
              variant="light"
              className="shrink-0 font-semibold"
              isDisabled={!isActive}
              onPress={() => clearColumn(def.columnId)}
            >
              Clear
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function EditorColumnFilters<TRow>({
  defs,
  rows,
  filters,
  onChange,
}: EditorColumnFiltersProps<TRow>) {
  const [isOpen, setIsOpen] = useState(false);

  const appliedCount = useMemo(
    () => countActiveColumnFilters(defs, filters),
    [defs, filters],
  );

  const hasAnyFilter = useMemo(
    () => defs.some((def) => isColumnFilterActive(def, filters[def.columnId])),
    [defs, filters],
  );

  if (defs.length === 0) return null;

  return (
    <>
      <Button
        size="sm"
        color="primary"
        variant="flat"
        className="shrink-0 font-semibold"
        onPress={() => setIsOpen(true)}
      >
        Filters ({appliedCount})
      </Button>

      <EditorModalShell
        isOpen={isOpen}
        title="Filters"
        onClose={() => setIsOpen(false)}
        maxWidthClass="max-w-3xl"
        footer={
          hasAnyFilter ? (
            <Button
              size="sm"
              variant="flat"
              className="font-semibold"
              onPress={() => onChange({})}
            >
              Clear all
            </Button>
          ) : undefined
        }
      >
        <EditorFilterPanel defs={defs} rows={rows} filters={filters} onChange={onChange} />
      </EditorModalShell>
    </>
  );
}

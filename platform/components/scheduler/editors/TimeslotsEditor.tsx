"use client";

import { useCallback, useMemo, useState } from "react";

import { ReadOnlyIdCell } from "./ReadOnlyIdCell";
import { EditableCell } from "../EditableCell";
import { EditableSelectCell } from "../EditableSelectCell";
import { MultiSelect } from "../MultiSelect";
import { RowNotesButton } from "../RowNotesButton";
import { EditorColumnFilters } from "./EditorColumnFilters";
import { EditorColumnPicker } from "./EditorColumnPicker";
import { EditorConfigurableTable } from "./EditorConfigurableTable";
import { useEditorColumnVisibility } from "./useEditorColumnVisibility";
import { useStableRowWrappers } from "./useStableRowWrappers";
import { EditorRowActions } from "./EditorRowActions";
import { EditorTableShell } from "./EditorTableShell";
import {
  applyEditorColumnFilters,
  type EditorColumnFilterDef,
  type EditorFiltersState,
} from "./editorFilters";
import { sortDefsFromFilterDefs } from "./editorSort";
import { TIMESLOT_COLUMN_SPECS } from "./editorColumnSpecs";
import { useEditorActions } from "./EditorActionProvider";
import { editorRowKey } from "./editorRowHighlight";
import { TimeslotEditModal } from "./modals/TimeslotEditModal";
import {
  TIMESLOT_BLOCK_TYPE_OPTIONS,
  TIMESLOT_DAY_OPTIONS,
  TIMESLOT_TIME_OPTIONS,
  clampTimeToBounds,
  fromTimeOnly,
  splitTimeslotDays,
  toTimeOnly,
} from "./timeslotEditorConstants";

import type { Timeslot } from "@/lib/scheduling/types";
import { insertAtSortedIdPosition } from "@/lib/scheduling/insertAtSortedIdPosition";
import { nextIntegerId } from "@/lib/scheduling/nextId";
import { SCHEDULING_WINDOW_START_TIME } from "@/lib/scheduling/timeWindow";

type TimeslotRow = { slot: Timeslot; index: number };

type TimeslotsEditorProps = {
  timeslots: Timeslot[];
  onUpdate: (timeslots: Timeslot[]) => void;
};

const createEmptyTimeslot = (existing: Timeslot[]): Timeslot => ({
  id: nextIntegerId(existing.map((t) => t.id)),
  day: "Mon",
  start_time: SCHEDULING_WINDOW_START_TIME,
  end_time: "10:00",
  slot_type: "standard",
});

export const TimeslotsEditor = ({ timeslots, onUpdate }: TimeslotsEditorProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<EditorFiltersState>({});
  const columnVisibility = useEditorColumnVisibility("timeslots", TIMESLOT_COLUMN_SPECS);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addDraft, setAddDraft] = useState<Timeslot | null>(null);
  const { confirmRowAdded, getRowHighlightClass } = useEditorActions();

  const updateTimeslot = (index: number, field: keyof Timeslot, value: unknown) => {
    const newTimeslots = [...timeslots];
    newTimeslots[index] = { ...newTimeslots[index], [field]: value };
    onUpdate(newTimeslots);
  };

  const addTimeslot = () => {
    setAddDraft(createEmptyTimeslot(timeslots));
  };

  const deleteTimeslot = (index: number) => {
    onUpdate(timeslots.filter((_, i) => i !== index));
  };

  const timeslotFilterDefs = useMemo(
    (): EditorColumnFilterDef<TimeslotRow>[] => [
      {
        columnId: "id",
        label: "ID",
        control: { kind: "multiSearch", textMatch: "contains" },
        getValue: ({ slot }) => slot.id,
      },
      {
        columnId: "days",
        label: "Days",
        control: { kind: "multiSelect" },
        options: TIMESLOT_DAY_OPTIONS,
        arrayValue: true,
        getValue: ({ slot }) => splitTimeslotDays(slot.day),
      },
      {
        columnId: "start",
        label: "Start",
        control: { kind: "timeCompare" },
        options: TIMESLOT_TIME_OPTIONS,
        getValue: ({ slot }) => clampTimeToBounds(toTimeOnly(slot.start_time)),
      },
      {
        columnId: "end",
        label: "End",
        control: { kind: "timeCompare" },
        options: TIMESLOT_TIME_OPTIONS,
        getValue: ({ slot }) => clampTimeToBounds(toTimeOnly(slot.end_time)),
      },
      {
        columnId: "block",
        label: "Block",
        control: { kind: "singleSelect" },
        options: TIMESLOT_BLOCK_TYPE_OPTIONS,
        getValue: ({ slot }) => slot.slot_type ?? "standard",
      },
    ],
    [],
  );

  const timeslotSortDefs = useMemo(
    () => sortDefsFromFilterDefs(timeslotFilterDefs),
    [timeslotFilterDefs],
  );

  const buildTimeslotRow = useCallback(
    (slot: Timeslot, index: number): TimeslotRow => ({ slot, index }),
    [],
  );
  const pickTimeslotBase = useCallback((row: TimeslotRow) => row.slot, []);
  const timeslotRows = useStableRowWrappers(
    timeslots,
    buildTimeslotRow,
    pickTimeslotBase,
  );

  const filteredTimeslots = useMemo((): TimeslotRow[] => {
    const query = searchQuery.trim().toLowerCase();
    let rows = timeslotRows;
    if (query) {
      rows = rows.filter(({ slot }) => {
        const searchable = [
          slot.id,
          slot.day,
          slot.start_time,
          slot.end_time,
          slot.slot_type ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      });
    }
    return applyEditorColumnFilters(rows, columnFilters, timeslotFilterDefs);
  }, [searchQuery, timeslotRows, columnFilters, timeslotFilterDefs]);

  const renderCell = (columnId: string, { slot, index: idx }: TimeslotRow) => {
    switch (columnId) {
      case "id":
        return <ReadOnlyIdCell value={slot.id} />;
      case "days":
        return (
          <MultiSelect
            value={splitTimeslotDays(slot.day)}
            options={TIMESLOT_DAY_OPTIONS}
            onChange={(v) => updateTimeslot(idx, "day", v.join(","))}
            placeholder="Select days"
          />
        );
      case "start":
        return (
          <EditableSelectCell
            value={clampTimeToBounds(toTimeOnly(slot.start_time))}
            options={TIMESLOT_TIME_OPTIONS}
            onChange={(v) => updateTimeslot(idx, "start_time", fromTimeOnly(v))}
            placeholder="Select time"
            isSearchable
          />
        );
      case "end":
        return (
          <EditableSelectCell
            value={clampTimeToBounds(toTimeOnly(slot.end_time))}
            options={TIMESLOT_TIME_OPTIONS}
            onChange={(v) => updateTimeslot(idx, "end_time", fromTimeOnly(v))}
            placeholder="Select time"
            isSearchable
          />
        );
      case "block":
        return (
          <EditableSelectCell
            value={slot.slot_type ?? "standard"}
            options={TIMESLOT_BLOCK_TYPE_OPTIONS}
            onChange={(v) => updateTimeslot(idx, "slot_type", v)}
            placeholder="Select block type"
          />
        );
      default:
        return null;
    }
  };

  return (
    <EditorTableShell
      title={`Timeslots (${filteredTimeslots.length})`}
      addLabel="Add Timeslot"
      onAdd={addTimeslot}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search timeslots..."
      filterBar={
        <div className="flex flex-wrap items-center gap-2">
          <EditorColumnFilters
            defs={timeslotFilterDefs}
            rows={timeslotRows}
            filters={columnFilters}
            onChange={setColumnFilters}
          />
          <EditorColumnPicker
            specs={columnVisibility.specs}
            visibleIds={columnVisibility.visibleIds}
            onToggle={columnVisibility.toggleColumn}
            onShowAll={columnVisibility.showAllColumns}
            onHideAll={columnVisibility.hideAllColumns}
          />
        </div>
      }
      emptyMessage='No timeslots. Click "Add Timeslot" to create one.'
      noMatchMessage="No timeslots match your search or filters."
      isEmpty={timeslots.length === 0}
      hasNoMatches={timeslots.length > 0 && filteredTimeslots.length === 0}
    >
      <EditorConfigurableTable
        editorKey="timeslots"
        columnSpecs={TIMESLOT_COLUMN_SPECS}
        visibility={columnVisibility}
        rows={filteredTimeslots}
        sortDefs={timeslotSortDefs}
        getRowKey={({ slot, index }) => `${slot.id}-${index}`}
        getRowId={({ slot }) => `note-timeslots-${encodeURIComponent(String(slot.id))}`}
        getRowClassName={({ slot }) =>
          getRowHighlightClass(
            "border-t border-default-200",
            "timeslots",
            String(slot.id),
          )
        }
        renderCell={renderCell}
        renderActions={({ slot, index: idx }) => (
          <EditorRowActions
            notes={
              <RowNotesButton
                scope="timeslots"
                rowId={String(slot.id)}
                title={`Timeslot Notes - ${slot.id}`}
              />
            }
            rowLabel={`timeslot ${slot.id}`}
            onEdit={() => setEditIndex(idx)}
            onDelete={() => deleteTimeslot(idx)}
          />
        )}
      />
      {editIndex !== null && timeslots[editIndex] ? (
        <TimeslotEditModal
          isOpen
          timeslot={timeslots[editIndex]}
          onClose={() => setEditIndex(null)}
          onSave={(updated) => {
            const next = [...timeslots];
            next[editIndex] = updated;
            onUpdate(next);
          }}
        />
      ) : null}
      {addDraft ? (
        <TimeslotEditModal
          isOpen
          mode="create"
          timeslot={addDraft}
          onClose={() => setAddDraft(null)}
          onSave={(created) => {
            onUpdate(insertAtSortedIdPosition(timeslots, created));
            setAddDraft(null);
            confirmRowAdded({
              rowKey: editorRowKey("timeslots", String(created.id)),
              message: `Successfully added timeslot ${created.id}.`,
            });
          }}
        />
      ) : null}
    </EditorTableShell>
  );
};

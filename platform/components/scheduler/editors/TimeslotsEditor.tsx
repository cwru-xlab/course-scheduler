"use client";

import { useMemo, useState } from "react";

import { EditableCell } from "../EditableCell";
import { EditableSelectCell } from "../EditableSelectCell";
import { MultiSelect } from "../MultiSelect";
import { RowNotesButton } from "../RowNotesButton";
import { EditorConfigurableTable } from "./EditorConfigurableTable";
import { EditorRowActions } from "./EditorRowActions";
import { EditorTableShell } from "./EditorTableShell";
import { TIMESLOT_COLUMN_SPECS } from "./editorColumnSpecs";
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
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const updateTimeslot = (index: number, field: keyof Timeslot, value: unknown) => {
    const newTimeslots = [...timeslots];
    newTimeslots[index] = { ...newTimeslots[index], [field]: value };
    onUpdate(newTimeslots);
  };

  const addTimeslot = () => {
    onUpdate([...timeslots, createEmptyTimeslot(timeslots)]);
  };

  const deleteTimeslot = (index: number) => {
    onUpdate(timeslots.filter((_, i) => i !== index));
  };

  const filteredTimeslots = useMemo((): TimeslotRow[] => {
    const query = searchQuery.trim().toLowerCase();
    return timeslots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => {
        if (!query) return true;
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
  }, [searchQuery, timeslots]);

  const renderCell = (columnId: string, { slot, index: idx }: TimeslotRow) => {
    switch (columnId) {
      case "id":
        return <EditableCell value={slot.id} onChange={(v) => updateTimeslot(idx, "id", v)} />;
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
      title={`Timeslots (${timeslots.length})`}
      addLabel="+ Add Timeslot"
      onAdd={addTimeslot}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search timeslots..."
      emptyMessage='No timeslots. Click "Add Timeslot" to create one.'
      noMatchMessage="No timeslots match your search."
      isEmpty={timeslots.length === 0}
      hasNoMatches={timeslots.length > 0 && filteredTimeslots.length === 0}
    >
      <EditorConfigurableTable
        editorKey="timeslots"
        columnSpecs={TIMESLOT_COLUMN_SPECS}
        rows={filteredTimeslots}
        getRowKey={({ slot, index }) => `${slot.id}-${index}`}
        getRowId={({ slot }) => `note-timeslots-${encodeURIComponent(String(slot.id))}`}
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
    </EditorTableShell>
  );
};

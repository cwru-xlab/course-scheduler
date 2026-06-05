"use client";

import { useMemo, useState } from "react";
import { Button } from "@heroui/button";

import { EditorTableShell, editorTd, editorTh } from "./EditorTableShell";

import { EditableCell } from "../EditableCell";
import { EditableSelectCell } from "../EditableSelectCell";
import { MultiSelect } from "../MultiSelect";
import { RowNotesButton } from "../RowNotesButton";

import type { Timeslot } from "@/lib/scheduling/types";
import { nextIntegerId } from "@/lib/scheduling/nextId";
import {
  SCHEDULING_WINDOW_END_TIME,
  SCHEDULING_WINDOW_START_TIME,
} from "@/lib/scheduling/timeWindow";

type TimeslotsEditorProps = {
  timeslots: Timeslot[];
  onUpdate: (timeslots: Timeslot[]) => void;
};

const DAY_OPTIONS = [
  { key: "Mon", label: "Mon" },
  { key: "Tue", label: "Tue" },
  { key: "Wed", label: "Wed" },
  { key: "Thu", label: "Thu" },
  { key: "Fri", label: "Fri" },
  { key: "Sat", label: "Sat" },
  { key: "Sun", label: "Sun" },
];

const createEmptyTimeslot = (existing: Timeslot[]): Timeslot => ({
  id: nextIntegerId(existing.map((t) => t.id)),
  day: "Mon",
  start_time: MIN_TIME,
  end_time: "10:00",
  slot_type: "standard",
});

const splitDays = (raw: string | string[] | undefined): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  // Support comma- or slash-separated strings from legacy data
  return raw
    .split(/[,/]/)
    .map((s) => s.trim())
    .filter(Boolean);
};

const HHMM_FALLBACK = SCHEDULING_WINDOW_START_TIME;
const MIN_TIME = SCHEDULING_WINDOW_START_TIME;
const MAX_TIME = SCHEDULING_WINDOW_END_TIME;

const toTimeOnly = (value: string | undefined): string => {
  if (!value) return HHMM_FALLBACK;
  if (value.includes("T")) {
    const timePart = value.split("T")[1] ?? HHMM_FALLBACK;
    return timePart.slice(0, 5);
  }
  return value.slice(0, 5);
};

const fromTimeOnly = (value: string): string => {
  if (!value) return HHMM_FALLBACK;
  return value.slice(0, 5);
};

const clampTimeToBounds = (hhmm: string): string => {
  if (!hhmm) return HHMM_FALLBACK;
  const toMinutes = (value: string) => {
    const [h, m] = value.split(":").map((x) => parseInt(x, 10));
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };
  const toHHMM = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };
  const min = toMinutes(MIN_TIME);
  const max = toMinutes(MAX_TIME);
  const val = toMinutes(hhmm);
  if (val < min) return MIN_TIME;
  if (val > max) return MAX_TIME;
  return toHHMM(val);
};

const TIME_OPTIONS = (() => {
  const options: { key: string; label: string }[] = [];
  const minHour = Number.parseInt(MIN_TIME.split(":")[0] ?? "8", 10);
  const maxHour = Number.parseInt(MAX_TIME.split(":")[0] ?? "22", 10);
  for (let minutes = minHour * 60; minutes <= maxHour * 60; minutes += 5) {
    const h24 = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const hh = h24.toString().padStart(2, "0");
    const mm = mins.toString().padStart(2, "0");
    const suffix = h24 >= 12 ? "PM" : "AM";
    const h12 = ((h24 + 11) % 12) + 1;
    options.push({
      key: `${hh}:${mm}`,
      label: `${h12}:${mm} ${suffix}`,
    });
  }
  return options;
})();

export const TimeslotsEditor = ({ timeslots, onUpdate }: TimeslotsEditorProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const updateTimeslot = (index: number, field: keyof Timeslot, value: unknown) => {
    const newTimeslots = [...timeslots];
    newTimeslots[index] = { ...newTimeslots[index], [field]: value };
    onUpdate(newTimeslots);
  };

  const BLOCK_TYPE_OPTIONS = [
    { key: "standard", label: "Short block" },
    { key: "evening", label: "Long block" },
  ];

  const addTimeslot = () => {
    onUpdate([...timeslots, createEmptyTimeslot(timeslots)]);
  };

  const deleteTimeslot = (index: number) => {
    onUpdate(timeslots.filter((_, i) => i !== index));
  };

  const filteredTimeslots = useMemo(() => {
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
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            <th className={`${editorTh} w-[10%]`}>ID</th>
            <th className={`${editorTh} w-[22%]`}>Days</th>
            <th className={`${editorTh} w-[18%]`}>Start</th>
            <th className={`${editorTh} w-[18%]`}>End</th>
            <th className={`${editorTh} w-[14%]`}>Block</th>
            <th className={`${editorTh} w-[12%]`}>Notes</th>
            <th className={`${editorTh} w-[6%]`} aria-label="Actions" />
          </tr>
        </thead>
          <tbody>
            {filteredTimeslots.map(({ slot, index: idx }) => (
              <tr
                key={`${slot.id}-${idx}`}
                id={`note-timeslots-${encodeURIComponent(String(slot.id))}`}
                className="border-t border-default-200"
              >
                <td className={editorTd}>
                  <EditableCell value={slot.id} onChange={(v) => updateTimeslot(idx, "id", v)} />
                </td>
                <td className={editorTd}>
                  <MultiSelect
                    value={splitDays(slot.day)}
                    options={DAY_OPTIONS}
                    onChange={(v) => updateTimeslot(idx, "day", v.join(","))}
                    placeholder="Select days"
                  />
                </td>
                <td className={editorTd}>
                  <EditableSelectCell
                    value={clampTimeToBounds(toTimeOnly(slot.start_time))}
                    options={TIME_OPTIONS}
                    onChange={(v) => updateTimeslot(idx, "start_time", fromTimeOnly(v))}
                    placeholder="Select time"
                    isSearchable
                  />
                </td>
                <td className={editorTd}>
                  <EditableSelectCell
                    value={clampTimeToBounds(toTimeOnly(slot.end_time))}
                    options={TIME_OPTIONS}
                    onChange={(v) => updateTimeslot(idx, "end_time", fromTimeOnly(v))}
                    placeholder="Select time"
                    isSearchable
                  />
                </td>
                <td className={editorTd}>
                  <EditableSelectCell
                    value={slot.slot_type ?? "standard"}
                    options={BLOCK_TYPE_OPTIONS}
                    onChange={(v) => updateTimeslot(idx, "slot_type", v)}
                    placeholder="Select block type"
                  />
                </td>
                <td className={editorTd}>
                  <RowNotesButton
                    scope="timeslots"
                    rowId={String(slot.id)}
                    title={`Timeslot Notes - ${slot.id}`}
                  />
                </td>
                <td className={editorTd}>
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteTimeslot(idx)}>
                    ✕
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
      </table>
    </EditorTableShell>
  );
};

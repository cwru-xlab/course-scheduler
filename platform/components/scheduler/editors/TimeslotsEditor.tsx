"use client";

import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";

import { EditableCell } from "../EditableCell";
import { EditableSelectCell } from "../EditableSelectCell";
import { MultiSelect } from "../MultiSelect";
import { RowNotesButton } from "../RowNotesButton";

import type { Timeslot } from "@/lib/scheduling/types";
import { nextIntegerId } from "@/lib/scheduling/nextId";

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
  start_time: "09:00",
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

const HHMM_FALLBACK = "09:00";
const MIN_TIME = "09:00";
const MAX_TIME = "21:00";

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
  for (let minutes = 9 * 60; minutes <= 21 * 60; minutes += 5) {
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Timeslots ({timeslots.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addTimeslot}>
          + Add Timeslot
        </Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">ID</th>
              <th className="pb-2 pr-3">Days</th>
              <th className="pb-2 pr-3">Start Time</th>
              <th className="pb-2 pr-3">End Time</th>
              <th className="pb-2 pr-3">Block Type</th>
              <th className="pb-2 pr-3">View Notes</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {timeslots.map((slot, idx) => (
              <tr
                key={`${slot.id}-${idx}`}
                id={`note-timeslots-${encodeURIComponent(String(slot.id))}`}
                className="border-t border-default-200"
              >
                <td className="py-2 pr-3">
                  <EditableCell value={slot.id} onChange={(v) => updateTimeslot(idx, "id", v)} />
                </td>
                <td className="py-2 pr-3">
                  <MultiSelect
                    value={splitDays(slot.day)}
                    options={DAY_OPTIONS}
                    onChange={(v) => updateTimeslot(idx, "day", v.join(","))}
                    placeholder="Select days"
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={clampTimeToBounds(toTimeOnly(slot.start_time))}
                    options={TIME_OPTIONS}
                    onChange={(v) => updateTimeslot(idx, "start_time", fromTimeOnly(v))}
                    placeholder="Select time"
                    isSearchable
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={clampTimeToBounds(toTimeOnly(slot.end_time))}
                    options={TIME_OPTIONS}
                    onChange={(v) => updateTimeslot(idx, "end_time", fromTimeOnly(v))}
                    placeholder="Select time"
                    isSearchable
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={slot.slot_type ?? "standard"}
                    options={BLOCK_TYPE_OPTIONS}
                    onChange={(v) => updateTimeslot(idx, "slot_type", v)}
                    placeholder="Select block type"
                  />
                </td>
                <td className="py-2 pr-3">
                  <RowNotesButton
                    scope="timeslots"
                    rowId={String(slot.id)}
                    title={`Timeslot Notes - ${slot.id}`}
                  />
                </td>
                <td className="py-2 pr-3">
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteTimeslot(idx)}>
                    ✕
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {timeslots.length === 0 && (
          <div className="py-4 text-center text-default-400">No timeslots. Click "Add Timeslot" to create one.</div>
        )}
      </CardBody>
    </Card>
  );
};

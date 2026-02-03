"use client";

import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";

import { EditableCell } from "../EditableCell";
import { EditableSelectCell } from "../EditableSelectCell";

import type { Timeslot } from "@/lib/scheduling/types";

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

const createEmptyTimeslot = (): Timeslot => ({
  id: `TS-NEW-${Date.now()}`,
  day: "Mon",
  start_time: "09:00",
  end_time: "10:00",
});

export const TimeslotsEditor = ({ timeslots, onUpdate }: TimeslotsEditorProps) => {
  const updateTimeslot = (index: number, field: keyof Timeslot, value: unknown) => {
    const newTimeslots = [...timeslots];
    newTimeslots[index] = { ...newTimeslots[index], [field]: value };
    onUpdate(newTimeslots);
  };

  const addTimeslot = () => {
    onUpdate([...timeslots, createEmptyTimeslot()]);
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
              <th className="pb-2 pr-3">Day</th>
              <th className="pb-2 pr-3">Start Time</th>
              <th className="pb-2 pr-3">End Time</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {timeslots.map((slot, idx) => (
              <tr key={`${slot.id}-${idx}`} className="border-t border-default-200">
                <td className="py-2 pr-3">
                  <EditableCell value={slot.id} onChange={(v) => updateTimeslot(idx, "id", v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={slot.day}
                    options={DAY_OPTIONS}
                    onChange={(v) => updateTimeslot(idx, "day", v)}
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={slot.start_time} onChange={(v) => updateTimeslot(idx, "start_time", v)} placeholder="HH:MM" />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={slot.end_time} onChange={(v) => updateTimeslot(idx, "end_time", v)} placeholder="HH:MM" />
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

"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/button";

import { EditorModalShell } from "../EditorModalShell";
import { MultiSelect } from "../../MultiSelect";
import type { MeetingPattern } from "@/lib/scheduling/types";

const DAY_OPTIONS = [
  { key: "Mon", label: "Mon" },
  { key: "Tue", label: "Tue" },
  { key: "Wed", label: "Wed" },
  { key: "Thu", label: "Thu" },
  { key: "Fri", label: "Fri" },
  { key: "Sat", label: "Sat" },
  { key: "Sun", label: "Sun" },
];

type MeetingPatternEditModalProps = {
  isOpen: boolean;
  pattern: MeetingPattern;
  timeslotOptions: { key: string; label: string }[];
  onClose: () => void;
  onSave: (pattern: MeetingPattern) => void;
};

export function MeetingPatternEditModal({
  isOpen,
  pattern,
  timeslotOptions,
  onClose,
  onSave,
}: MeetingPatternEditModalProps) {
  const [draft, setDraft] = useState(pattern);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(pattern);
      setError(null);
    }
  }, [isOpen, pattern]);

  const updateTimeslotSet = (setIndex: number, value: string[]) => {
    const newSets = [...draft.compatible_timeslot_sets];
    newSets[setIndex] = value;
    setDraft((d) => ({ ...d, compatible_timeslot_sets: newSets }));
  };

  const addTimeslotSet = () => {
    setDraft((d) => ({
      ...d,
      compatible_timeslot_sets: [...d.compatible_timeslot_sets, []],
    }));
  };

  const deleteTimeslotSet = (setIndex: number) => {
    setDraft((d) => ({
      ...d,
      compatible_timeslot_sets: d.compatible_timeslot_sets.filter((_, i) => i !== setIndex),
    }));
  };

  const handleSave = () => {
    if (!draft.id.trim()) {
      setError("Pattern ID is required.");
      return;
    }
    onSave({ ...draft, id: draft.id.trim() });
    onClose();
  };

  return (
    <EditorModalShell
      isOpen={isOpen}
      title={`Edit meeting pattern — ${pattern.id}`}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      footer={
        <>
          <Button variant="flat" onPress={onClose}>
            Cancel
          </Button>
          <Button color="primary" className="font-bold" onPress={handleSave}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">ID</span>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={draft.id}
            onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Slots required</span>
          <input
            type="number"
            min={1}
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={draft.slots_required}
            onChange={(e) =>
              setDraft((d) => ({ ...d, slots_required: Number(e.target.value) || 1 }))
            }
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold text-slate-600">Allowed days</span>
          <MultiSelect
            value={draft.allowed_days}
            options={DAY_OPTIONS}
            onChange={(v) => setDraft((d) => ({ ...d, allowed_days: v }))}
            placeholder="Select days"
          />
        </label>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600">Compatible timeslot sets</span>
          <Button size="sm" variant="light" onPress={addTimeslotSet}>
            + Add set
          </Button>
        </div>
        <div className="space-y-2">
          {draft.compatible_timeslot_sets.map((set, setIdx) => (
            <div
              key={setIdx}
              className="flex items-center gap-2 rounded-lg border border-default-200 bg-default-50 px-2 py-2"
            >
              <span className="text-xs text-default-500 shrink-0">Set {setIdx + 1}</span>
              <MultiSelect
                value={set}
                options={timeslotOptions}
                onChange={(v) => updateTimeslotSet(setIdx, v)}
                placeholder="Select timeslots"
                showSearch
              />
              <Button
                size="sm"
                color="danger"
                variant="light"
                isIconOnly
                onPress={() => deleteTimeslotSet(setIdx)}
                aria-label={`Remove set ${setIdx + 1}`}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
      </div>
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
    </EditorModalShell>
  );
}

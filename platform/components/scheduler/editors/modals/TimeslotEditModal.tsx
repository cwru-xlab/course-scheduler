"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/button";

import { EditorModalShell } from "../EditorModalShell";
import { MultiSelect } from "../../MultiSelect";
import {
  TIMESLOT_BLOCK_TYPE_OPTIONS,
  TIMESLOT_DAY_OPTIONS,
  TIMESLOT_TIME_OPTIONS,
  clampTimeToBounds,
  fromTimeOnly,
  splitTimeslotDays,
  toTimeOnly,
} from "../timeslotEditorConstants";
import type { Timeslot } from "@/lib/scheduling/types";

type TimeslotEditModalProps = {
  isOpen: boolean;
  timeslot: Timeslot;
  mode?: "create" | "edit";
  onClose: () => void;
  onSave: (timeslot: Timeslot) => void;
};

export function TimeslotEditModal({
  isOpen,
  timeslot,
  mode = "edit",
  onClose,
  onSave,
}: TimeslotEditModalProps) {
  const [draft, setDraft] = useState(timeslot);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(timeslot);
      setError(null);
    }
  }, [isOpen, timeslot]);

  const handleSave = () => {
    if (!draft.id.trim()) {
      setError("Timeslot ID is required.");
      return;
    }
    onSave({
      ...draft,
      id: draft.id.trim(),
      day: splitTimeslotDays(draft.day).join(","),
      start_time: fromTimeOnly(clampTimeToBounds(toTimeOnly(draft.start_time))),
      end_time: fromTimeOnly(clampTimeToBounds(toTimeOnly(draft.end_time))),
    });
    onClose();
  };

  return (
    <EditorModalShell
      isOpen={isOpen}
      title={mode === "create" ? "Add timeslot" : `Edit timeslot — ${timeslot.id}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="flat" onPress={onClose}>
            Cancel
          </Button>
          <Button color="primary" className="font-bold" onPress={handleSave}>
            {mode === "create" ? "Add" : "Save changes"}
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
          <span className="text-xs font-semibold text-slate-600">Block type</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            value={draft.slot_type ?? "standard"}
            onChange={(e) => setDraft((d) => ({ ...d, slot_type: e.target.value }))}
          >
            {TIMESLOT_BLOCK_TYPE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold text-slate-600">Days</span>
          <MultiSelect
            value={splitTimeslotDays(draft.day)}
            options={TIMESLOT_DAY_OPTIONS}
            onChange={(v) => setDraft((d) => ({ ...d, day: v.join(",") }))}
            placeholder="Select days"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Start time</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            value={clampTimeToBounds(toTimeOnly(draft.start_time))}
            onChange={(e) =>
              setDraft((d) => ({ ...d, start_time: fromTimeOnly(e.target.value) }))
            }
          >
            {TIMESLOT_TIME_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">End time</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            value={clampTimeToBounds(toTimeOnly(draft.end_time))}
            onChange={(e) =>
              setDraft((d) => ({ ...d, end_time: fromTimeOnly(e.target.value) }))
            }
          >
            {TIMESLOT_TIME_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
    </EditorModalShell>
  );
}

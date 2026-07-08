"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/button";

import { EditorModalShell } from "../EditorModalShell";
import { MultiSelect } from "../../MultiSelect";
import type { Instructor } from "@/lib/scheduling/types";

const RANK_OPTIONS = [
  { key: "TT", label: "TT" },
  { key: "Tenured", label: "Tenured" },
  { key: "NTT", label: "NTT" },
  { key: "Adjunct", label: "Adjunct" },
];

const DAY_OPTIONS = [
  { key: "Mon", label: "Mon" },
  { key: "Tue", label: "Tue" },
  { key: "Wed", label: "Wed" },
  { key: "Thu", label: "Thu" },
  { key: "Fri", label: "Fri" },
];

type InstructorEditModalProps = {
  isOpen: boolean;
  instructor: Instructor;
  mode?: "create" | "edit";
  meetingPatternOptions: { key: string; label: string }[];
  timeslotOptions: { key: string; label: string }[];
  onClose: () => void;
  onSave: (instructor: Instructor) => void;
};

export function InstructorEditModal({
  isOpen,
  instructor,
  mode = "edit",
  meetingPatternOptions,
  timeslotOptions,
  onClose,
  onSave,
}: InstructorEditModalProps) {
  const [draft, setDraft] = useState(instructor);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(instructor);
      setError(null);
    }
  }, [isOpen, instructor]);

  const handleSave = () => {
    if (!draft.id.trim()) {
      setError("Instructor ID is required.");
      return;
    }
    onSave({
      ...draft,
      id: draft.id.trim(),
      name: draft.name.trim(),
    });
    onClose();
  };

  return (
    <EditorModalShell
      isOpen={isOpen}
      title={mode === "create" ? "Add instructor" : `Edit instructor — ${instructor.id}`}
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
          <span className="text-xs font-semibold text-slate-600">Name</span>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Rank</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            value={draft.rank_type}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                rank_type: e.target.value as Instructor["rank_type"],
              }))
            }
          >
            {RANK_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Max teaching days</span>
          <input
            type="number"
            min={0}
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={draft.preferences.max_teaching_days ?? ""}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                preferences: {
                  ...d.preferences,
                  max_teaching_days: e.target.value ? Number(e.target.value) : undefined,
                },
              }))
            }
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold text-slate-600">Unavailable times</span>
          <MultiSelect
            value={draft.unavailable_times}
            options={timeslotOptions}
            onChange={(v) => setDraft((d) => ({ ...d, unavailable_times: v }))}
            placeholder="Select timeslots"
            showSearch
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold text-slate-600">Preferred days</span>
          <MultiSelect
            value={draft.preferences.preferred_days}
            options={DAY_OPTIONS}
            onChange={(v) =>
              setDraft((d) => ({
                ...d,
                preferences: { ...d.preferences, preferred_days: v },
              }))
            }
            placeholder="Select days"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold text-slate-600">Preferred patterns</span>
          <MultiSelect
            value={draft.preferences.preferred_patterns}
            options={meetingPatternOptions}
            onChange={(v) =>
              setDraft((d) => ({
                ...d,
                preferences: { ...d.preferences, preferred_patterns: v },
              }))
            }
            placeholder="Select patterns"
            showSearch
          />
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

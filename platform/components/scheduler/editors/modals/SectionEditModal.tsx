"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/button";

import { EditorModalShell } from "../EditorModalShell";
import { MultiSelect } from "../../MultiSelect";
import { joinCsv, splitCsv } from "@/lib/scheduling/csvFields";
import type { Section, SectionState } from "@/lib/scheduling/types";
import {
  normalizeSectionState,
} from "@/lib/scheduling/sectionState";

const STATE_OPTIONS: { key: SectionState; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "new", label: "New" },
  { key: "archived", label: "Archived" },
];

const SECTION_COURSE_PLACEHOLDER = "Introduction to Accounting";
const SECTION_CODE_PLACEHOLDER = "101";

type SectionEditModalProps = {
  isOpen: boolean;
  section: Section;
  mode?: "create" | "edit";
  instructorOptions: { key: string; label: string }[];
  meetingPatternOptions: { key: string; label: string }[];
  crosslistGroupOptions: { key: string; label: string }[];
  onClose: () => void;
  onSave: (section: Section) => void;
};

export function SectionEditModal({
  isOpen,
  section,
  mode = "edit",
  instructorOptions,
  meetingPatternOptions,
  crosslistGroupOptions,
  onClose,
  onSave,
}: SectionEditModalProps) {
  const [draft, setDraft] = useState(section);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(section);
      setError(null);
    }
  }, [isOpen, section]);

  const crosslistOptionsWithNone = [
    { key: "__none__", label: "(None)" },
    ...crosslistGroupOptions,
  ];

  const handleSave = () => {
    if (
      !draft.id.trim() ||
      !draft.course_id.trim() ||
      !draft.section_code.trim() ||
      !draft.instructor_id.trim()
    ) {
      setError("Section ID, course, code, and instructor are required.");
      return;
    }
    onSave({
      ...draft,
      id: draft.id.trim(),
      course_id: draft.course_id.trim(),
      section_code: draft.section_code.trim(),
      instructor_id: draft.instructor_id.trim(),
      department: (draft.department ?? "").trim(),
      state: normalizeSectionState(draft.state),
    });
    onClose();
  };

  const footer = (
    <>
      <Button variant="flat" onPress={onClose}>
        Cancel
      </Button>
      <Button color="primary" className="font-bold" onPress={handleSave}>
        {mode === "create" ? "Add" : "Save changes"}
      </Button>
    </>
  );

  return (
    <EditorModalShell
      isOpen={isOpen}
      title={mode === "create" ? "Add section" : `Edit section — ${section.id}`}
      onClose={onClose}
      footer={footer}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Section ID</span>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={draft.id}
            onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Department</span>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={draft.department ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Course</span>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2"
            placeholder={SECTION_COURSE_PLACEHOLDER}
            value={draft.course_id}
            onChange={(e) => setDraft((d) => ({ ...d, course_id: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Code</span>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2"
            placeholder={SECTION_CODE_PLACEHOLDER}
            value={draft.section_code}
            onChange={(e) => setDraft((d) => ({ ...d, section_code: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">State</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            value={normalizeSectionState(draft.state)}
            onChange={(e) =>
              setDraft((d) => ({ ...d, state: e.target.value as SectionState }))
            }
          >
            {STATE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Instructor</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            value={draft.instructor_id}
            onChange={(e) => setDraft((d) => ({ ...d, instructor_id: e.target.value }))}
          >
            <option value="">Select instructor</option>
            {instructorOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Expected enrollment</span>
          <input
            type="number"
            min={0}
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={draft.expected_enrollment}
            onChange={(e) =>
              setDraft((d) => ({ ...d, expected_enrollment: Number(e.target.value) || 0 }))
            }
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Enrollment cap</span>
          <input
            type="number"
            min={0}
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={draft.enrollment_cap}
            onChange={(e) =>
              setDraft((d) => ({ ...d, enrollment_cap: Number(e.target.value) || 0 }))
            }
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold text-slate-600">Allowed meeting patterns</span>
          <MultiSelect
            value={draft.allowed_meeting_patterns}
            options={meetingPatternOptions}
            onChange={(v) => setDraft((d) => ({ ...d, allowed_meeting_patterns: v }))}
            placeholder="Select patterns"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold text-slate-600">Assigned pattern</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            value={draft.previous_meeting_pattern ?? "__none__"}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                previous_meeting_pattern:
                  e.target.value === "__none__" ? undefined : e.target.value,
              }))
            }
          >
            <option value="__none__">(None)</option>
            {meetingPatternOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold text-slate-600">
            Room requirements (comma-separated)
          </span>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={joinCsv(draft.room_requirements)}
            onChange={(e) =>
              setDraft((d) => ({ ...d, room_requirements: splitCsv(e.target.value) }))
            }
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Crosslist group</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            value={draft.crosslist_group_id ?? "__none__"}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                crosslist_group_id: e.target.value === "__none__" ? null : e.target.value,
              }))
            }
          >
            {crosslistOptionsWithNone.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Tags (comma-separated)</span>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={joinCsv(draft.tags)}
            onChange={(e) => setDraft((d) => ({ ...d, tags: splitCsv(e.target.value) }))}
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

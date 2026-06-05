"use client";

import { useMemo, useState } from "react";
import { Button } from "@heroui/button";

import { EditorTableShell, editorTd, editorTh } from "./EditorTableShell";

import { EditableCell } from "../EditableCell";
import { EditableSelectCell } from "../EditableSelectCell";
import { MultiSelect } from "../MultiSelect";
import { RowNotesButton } from "../RowNotesButton";

import type { Instructor } from "@/lib/scheduling/types";
import { nextIntegerId } from "@/lib/scheduling/nextId";

type InstructorsEditorProps = {
  instructors: Instructor[];
  meetingPatternOptions: { key: string; label: string }[];
  timeslotOptions: { key: string; label: string }[];
  onUpdate: (instructors: Instructor[]) => void;
};

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

const createEmptyInstructor = (existing: Instructor[]): Instructor => ({
  id: nextIntegerId(existing.map((i) => i.id)),
  name: "",
  rank_type: "NTT",
  unavailable_times: [],
  preferences: {
    preferred_days: [],
    preferred_patterns: [],
  },
});

export const InstructorsEditor = ({
  instructors,
  meetingPatternOptions,
  timeslotOptions,
  onUpdate,
}: InstructorsEditorProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const updateInstructor = (index: number, field: string, value: unknown) => {
    const newInstructors = [...instructors];
    if (field.startsWith("preferences.")) {
      const prefField = field.replace("preferences.", "") as keyof Instructor["preferences"];
      newInstructors[index] = {
        ...newInstructors[index],
        preferences: { ...newInstructors[index].preferences, [prefField]: value },
      };
    } else {
      newInstructors[index] = { ...newInstructors[index], [field]: value };
    }
    onUpdate(newInstructors);
  };

  const addInstructor = () => {
    onUpdate([...instructors, createEmptyInstructor(instructors)]);
  };

  const deleteInstructor = (index: number) => {
    onUpdate(instructors.filter((_, i) => i !== index));
  };

  const filteredInstructors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return instructors
      .map((inst, index) => ({ inst, index }))
      .filter(({ inst }) => {
        if (!query) return true;
        const searchable = [
          inst.id,
          inst.name,
          inst.rank_type,
          ...inst.unavailable_times,
          ...inst.preferences.preferred_days,
          ...inst.preferences.preferred_patterns,
          inst.preferences.max_teaching_days ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      });
  }, [instructors, searchQuery]);

  return (
    <EditorTableShell
      title={`Instructors (${instructors.length})`}
      addLabel="+ Add Instructor"
      onAdd={addInstructor}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search instructors..."
      emptyMessage='No instructors. Click "Add Instructor" to create one.'
      noMatchMessage="No instructors match your search."
      isEmpty={instructors.length === 0}
      hasNoMatches={instructors.length > 0 && filteredInstructors.length === 0}
    >
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            <th className={`${editorTh} w-[8%]`}>ID</th>
            <th className={`${editorTh} w-[14%]`}>Name</th>
            <th className={`${editorTh} w-[10%]`}>Rank</th>
            <th className={`${editorTh} w-[22%]`}>Unavailable</th>
            <th className={`${editorTh} w-[14%]`}>Pref. Days</th>
            <th className={`${editorTh} w-[20%]`}>Pref. Patterns</th>
            <th className={`${editorTh} w-[8%]`}>Max Days</th>
            <th className={`${editorTh} w-[10%]`}>Notes</th>
            <th className={`${editorTh} w-[4%]`} aria-label="Actions" />
          </tr>
        </thead>
          <tbody>
            {filteredInstructors.map(({ inst, index: idx }) => (
              <tr
                key={`${inst.id}-${idx}`}
                id={`note-instructors-${encodeURIComponent(String(inst.id))}`}
                className="border-t border-default-200"
              >
                <td className={editorTd}>
                  <EditableCell value={inst.id} onChange={(v) => updateInstructor(idx, "id", v)} />
                </td>
                <td className={editorTd}>
                  <EditableCell value={inst.name} onChange={(v) => updateInstructor(idx, "name", v)} />
                </td>
                <td className={editorTd}>
                  <EditableSelectCell
                    value={inst.rank_type}
                    options={RANK_OPTIONS}
                    onChange={(v) => updateInstructor(idx, "rank_type", v)}
                  />
                </td>
                <td className={editorTd}>
                  <MultiSelect
                    value={inst.unavailable_times}
                    options={timeslotOptions}
                    onChange={(v) => updateInstructor(idx, "unavailable_times", v)}
                    placeholder="Select timeslots"
                  />
                </td>
                <td className={editorTd}>
                  <MultiSelect
                    value={inst.preferences.preferred_days}
                    options={DAY_OPTIONS}
                    onChange={(v) => updateInstructor(idx, "preferences.preferred_days", v)}
                    placeholder="Select days"
                  />
                </td>
                <td className={editorTd}>
                  <MultiSelect
                    value={inst.preferences.preferred_patterns}
                    options={meetingPatternOptions}
                    onChange={(v) => updateInstructor(idx, "preferences.preferred_patterns", v)}
                    placeholder="Select patterns"
                  />
                </td>
                <td className={editorTd}>
                  <EditableCell
                    type="number"
                    value={inst.preferences.max_teaching_days ?? ""}
                    onChange={(v) => updateInstructor(idx, "preferences.max_teaching_days", v || undefined)}
                    placeholder="—"
                  />
                </td>
                <td className={editorTd}>
                  <RowNotesButton
                    scope="instructors"
                    rowId={String(inst.id)}
                    title={`Instructor Notes - ${inst.name || inst.id}`}
                  />
                </td>
                <td className={editorTd}>
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteInstructor(idx)}>
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

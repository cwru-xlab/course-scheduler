"use client";

import { useMemo, useState } from "react";

import { EditorConfigurableTable } from "./EditorConfigurableTable";
import { EditorRowActions } from "./EditorRowActions";
import { EditorTableShell } from "./EditorTableShell";
import { INSTRUCTOR_COLUMN_SPECS } from "./editorColumnSpecs";
import { InstructorEditModal } from "./modals/InstructorEditModal";

import { EditableCell } from "../EditableCell";
import { EditableSelectCell } from "../EditableSelectCell";
import { MultiSelect } from "../MultiSelect";
import { RowNotesButton } from "../RowNotesButton";

import type { Instructor } from "@/lib/scheduling/types";
import { nextIntegerId } from "@/lib/scheduling/nextId";

type InstructorRow = { inst: Instructor; index: number };

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
  const [editIndex, setEditIndex] = useState<number | null>(null);

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

  const filteredInstructors = useMemo((): InstructorRow[] => {
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

  const renderCell = (columnId: string, { inst, index: idx }: InstructorRow) => {
    switch (columnId) {
      case "id":
        return <EditableCell value={inst.id} onChange={(v) => updateInstructor(idx, "id", v)} />;
      case "name":
        return <EditableCell value={inst.name} onChange={(v) => updateInstructor(idx, "name", v)} />;
      case "rank":
        return (
          <EditableSelectCell
            value={inst.rank_type}
            options={RANK_OPTIONS}
            onChange={(v) => updateInstructor(idx, "rank_type", v)}
          />
        );
      case "unavailable":
        return (
          <MultiSelect
            value={inst.unavailable_times}
            options={timeslotOptions}
            onChange={(v) => updateInstructor(idx, "unavailable_times", v)}
            placeholder="Select timeslots"
          />
        );
      case "pref_days":
        return (
          <MultiSelect
            value={inst.preferences.preferred_days}
            options={DAY_OPTIONS}
            onChange={(v) => updateInstructor(idx, "preferences.preferred_days", v)}
            placeholder="Select days"
          />
        );
      case "pref_patterns":
        return (
          <MultiSelect
            value={inst.preferences.preferred_patterns}
            options={meetingPatternOptions}
            onChange={(v) => updateInstructor(idx, "preferences.preferred_patterns", v)}
            placeholder="Select patterns"
          />
        );
      case "max_days":
        return (
          <EditableCell
            type="number"
            value={inst.preferences.max_teaching_days ?? ""}
            onChange={(v) => updateInstructor(idx, "preferences.max_teaching_days", v || undefined)}
            placeholder="—"
          />
        );
      default:
        return null;
    }
  };

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
      <EditorConfigurableTable
        editorKey="instructors"
        columnSpecs={INSTRUCTOR_COLUMN_SPECS}
        rows={filteredInstructors}
        getRowKey={({ inst, index }) => `${inst.id}-${index}`}
        getRowId={({ inst }) => `note-instructors-${encodeURIComponent(String(inst.id))}`}
        renderCell={renderCell}
        renderActions={({ inst, index: idx }) => (
          <EditorRowActions
            notes={
              <RowNotesButton
                scope="instructors"
                rowId={String(inst.id)}
                title={`Instructor Notes - ${inst.name || inst.id}`}
              />
            }
            rowLabel={`instructor ${inst.name || inst.id} (${inst.id})`}
            onEdit={() => setEditIndex(idx)}
            onDelete={() => deleteInstructor(idx)}
          />
        )}
      />
      {editIndex !== null && instructors[editIndex] ? (
        <InstructorEditModal
          isOpen
          instructor={instructors[editIndex]}
          meetingPatternOptions={meetingPatternOptions}
          timeslotOptions={timeslotOptions}
          onClose={() => setEditIndex(null)}
          onSave={(updated) => {
            const next = [...instructors];
            next[editIndex] = updated;
            onUpdate(next);
          }}
        />
      ) : null}
    </EditorTableShell>
  );
};

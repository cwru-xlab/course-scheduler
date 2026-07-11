"use client";

import { useCallback, useMemo, useState } from "react";

import { EditorColumnFilters } from "./EditorColumnFilters";
import { EditorColumnPicker } from "./EditorColumnPicker";
import { EditorConfigurableTable } from "./EditorConfigurableTable";
import { useEditorColumnVisibility } from "./useEditorColumnVisibility";
import { useStableRowWrappers } from "./useStableRowWrappers";
import { EditorRowActions } from "./EditorRowActions";
import { EditorTableShell } from "./EditorTableShell";
import {
  applyEditorColumnFilters,
  type EditorColumnFilterDef,
  type EditorFiltersState,
} from "./editorFilters";
import { sortDefsFromFilterDefs } from "./editorSort";
import { INSTRUCTOR_COLUMN_SPECS } from "./editorColumnSpecs";
import { useEditorActions } from "./EditorActionProvider";
import { editorRowKey } from "./editorRowHighlight";
import { InstructorEditModal } from "./modals/InstructorEditModal";

import { ReadOnlyIdCell } from "./ReadOnlyIdCell";
import { EditableCell } from "../EditableCell";
import { EditableSelectCell } from "../EditableSelectCell";
import { MultiSelect } from "../MultiSelect";
import { RowNotesButton } from "../RowNotesButton";

import type { Instructor } from "@/lib/scheduling/types";
import { insertAtSortedIdPosition } from "@/lib/scheduling/insertAtSortedIdPosition";
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
  const [columnFilters, setColumnFilters] = useState<EditorFiltersState>({});
  const columnVisibility = useEditorColumnVisibility("instructors", INSTRUCTOR_COLUMN_SPECS);
  const [addDraft, setAddDraft] = useState<Instructor | null>(null);
  const { confirmRowAdded, getRowHighlightClass } = useEditorActions();

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
    setAddDraft(createEmptyInstructor(instructors));
  };

  const deleteInstructor = (index: number) => {
    onUpdate(instructors.filter((_, i) => i !== index));
  };

  const instructorFilterDefs = useMemo(
    (): EditorColumnFilterDef<InstructorRow>[] => [
      {
        columnId: "id",
        label: "ID",
        control: { kind: "multiSearch", textMatch: "startsWith" },
        getValue: ({ inst }) => inst.id,
      },
      {
        columnId: "name",
        label: "Name",
        control: { kind: "multiSearch", textMatch: "contains" },
        getValue: ({ inst }) => inst.name,
      },
      {
        columnId: "rank",
        label: "Rank",
        control: { kind: "multiSelect" },
        options: RANK_OPTIONS,
        getValue: ({ inst }) => inst.rank_type,
      },
      {
        columnId: "unavailable",
        label: "Unavailable",
        control: { kind: "multiSelect", showSearch: true },
        options: timeslotOptions,
        arrayValue: true,
        getValue: ({ inst }) => inst.unavailable_times,
      },
      {
        columnId: "pref_days",
        label: "Pref. Days",
        control: { kind: "multiSelect" },
        options: DAY_OPTIONS,
        arrayValue: true,
        getValue: ({ inst }) => inst.preferences.preferred_days,
      },
      {
        columnId: "pref_patterns",
        label: "Pref. Patterns",
        control: { kind: "multiSelect" },
        options: meetingPatternOptions,
        arrayValue: true,
        getValue: ({ inst }) => inst.preferences.preferred_patterns,
      },
      {
        columnId: "max_days",
        label: "Max Days",
        control: { kind: "numberCompare" },
        getValue: ({ inst }) => inst.preferences.max_teaching_days ?? "",
      },
    ],
    [meetingPatternOptions, timeslotOptions],
  );

  const instructorSortDefs = useMemo(
    () => sortDefsFromFilterDefs(instructorFilterDefs),
    [instructorFilterDefs],
  );

  const buildInstructorRow = useCallback(
    (inst: Instructor, index: number): InstructorRow => ({ inst, index }),
    [],
  );
  const pickInstructorBase = useCallback((row: InstructorRow) => row.inst, []);
  const instructorRows = useStableRowWrappers(
    instructors,
    buildInstructorRow,
    pickInstructorBase,
  );

  const filteredInstructors = useMemo((): InstructorRow[] => {
    const query = searchQuery.trim().toLowerCase();
    let rows = instructorRows;
    if (query) {
      rows = rows.filter(({ inst }) => {
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
    }
    return applyEditorColumnFilters(rows, columnFilters, instructorFilterDefs);
  }, [instructorRows, searchQuery, columnFilters, instructorFilterDefs]);

  const renderCell = (columnId: string, { inst, index: idx }: InstructorRow) => {
    switch (columnId) {
      case "id":
        return <ReadOnlyIdCell value={inst.id} />;
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
      title={`Instructors (${filteredInstructors.length})`}
      addLabel="Add Instructor"
      onAdd={addInstructor}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search instructors..."
      filterBar={
        <div className="flex flex-wrap items-center gap-2">
          <EditorColumnFilters
            defs={instructorFilterDefs}
            rows={instructorRows}
            filters={columnFilters}
            onChange={setColumnFilters}
          />
          <EditorColumnPicker
            specs={columnVisibility.specs}
            visibleIds={columnVisibility.visibleIds}
            onToggle={columnVisibility.toggleColumn}
            onShowAll={columnVisibility.showAllColumns}
            onHideAll={columnVisibility.hideAllColumns}
          />
        </div>
      }
      emptyMessage='No instructors. Click "Add Instructor" to create one.'
      noMatchMessage="No instructors match your search or filters."
      isEmpty={instructors.length === 0}
      hasNoMatches={instructors.length > 0 && filteredInstructors.length === 0}
    >
      <EditorConfigurableTable
        editorKey="instructors"
        columnSpecs={INSTRUCTOR_COLUMN_SPECS}
        visibility={columnVisibility}
        rows={filteredInstructors}
        sortDefs={instructorSortDefs}
        getRowKey={({ inst, index }) => `${inst.id}-${index}`}
        getRowId={({ inst }) => `note-instructors-${encodeURIComponent(String(inst.id))}`}
        getRowClassName={({ inst }) =>
          getRowHighlightClass(
            "border-t border-default-200",
            "instructors",
            String(inst.id),
          )
        }
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
            onDelete={() => deleteInstructor(idx)}
          />
        )}
      />
      {addDraft ? (
        <InstructorEditModal
          isOpen
          mode="create"
          instructor={addDraft}
          meetingPatternOptions={meetingPatternOptions}
          timeslotOptions={timeslotOptions}
          onClose={() => setAddDraft(null)}
          onSave={(created) => {
            onUpdate(insertAtSortedIdPosition(instructors, created));
            setAddDraft(null);
            confirmRowAdded({
              rowKey: editorRowKey("instructors", String(created.id)),
              message: `Successfully added instructor ${created.name || created.id}.`,
            });
          }}
        />
      ) : null}
    </EditorTableShell>
  );
};

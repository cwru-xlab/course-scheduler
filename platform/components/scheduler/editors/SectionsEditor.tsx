"use client";

import { useMemo, useState } from "react";

import { EditorColumnFilters } from "./EditorColumnFilters";
import { EditorConfigurableTable } from "./EditorConfigurableTable";
import { EditorRowActions } from "./EditorRowActions";
import { EditorTableShell } from "./EditorTableShell";
import {
  applyEditorColumnFilters,
  type EditorColumnFilterDef,
  type EditorFiltersState,
} from "./editorFilters";
import { SECTION_COLUMN_SPECS } from "./editorColumnSpecs";
import { useEditorActions } from "./EditorActionProvider";
import { editorRowKey, recentlyAddedRowClass } from "./editorRowHighlight";
import { SectionEditModal } from "./modals/SectionEditModal";

import { EditableCell } from "../EditableCell";
import { EditableArrayCell } from "../EditableArrayCell";
import { EditableSelectCell } from "../EditableSelectCell";
import { MultiSelect } from "../MultiSelect";
import { RowNotesButton } from "../RowNotesButton";

import type { Section, SectionState } from "@/lib/scheduling/types";
import { useHideArchivedSections } from "@/lib/editor-ui-preferences";
import { insertAtSortedIdPosition } from "@/lib/scheduling/insertAtSortedIdPosition";
import { nextIntegerId } from "@/lib/scheduling/nextId";
import {
  isSectionArchived,
  isSectionNew,
  normalizeSectionState,
} from "@/lib/scheduling/sectionState";

const STATE_OPTIONS: { key: SectionState; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "new", label: "New" },
  { key: "archived", label: "Archived" },
];

type SectionsEditorProps = {
  sections: Section[];
  instructorOptions: { key: string; label: string }[];
  meetingPatternOptions: { key: string; label: string }[];
  crosslistGroupOptions: { key: string; label: string }[];
  onUpdate: (sections: Section[]) => void;
};

type SectionRow = { section: Section; index: number };

const SECTION_COURSE_PLACEHOLDER = "Introduction to Accounting";
const SECTION_CODE_PLACEHOLDER = "101";

const createEmptySection = (existing: Section[]): Section => ({
  id: nextIntegerId(existing.map((s) => s.id)),
  course_id: "",
  department: "",
  section_code: "",
  instructor_id: "",
  expected_enrollment: 20,
  enrollment_cap: 30,
  allowed_meeting_patterns: [],
  previous_meeting_pattern: undefined,
  room_requirements: [],
  crosslist_group_id: null,
  tags: [],
  state: "new",
});

export const SectionsEditor = ({
  sections,
  instructorOptions,
  meetingPatternOptions,
  crosslistGroupOptions,
  onUpdate,
}: SectionsEditorProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<EditorFiltersState>({});
  const [hideArchived, setHideArchived] = useHideArchivedSections();
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addDraft, setAddDraft] = useState<Section | null>(null);
  const { confirmRowAdded, isRowRecentlyAdded } = useEditorActions();

  const updateSection = (index: number, field: keyof Section, value: unknown) => {
    const newSections = [...sections];
    newSections[index] = { ...newSections[index], [field]: value };
    onUpdate(newSections);
  };

  const addSection = () => {
    setAddDraft(createEmptySection(sections));
  };

  const deleteSection = (index: number) => {
    onUpdate(sections.filter((_, i) => i !== index));
  };

  const crosslistOptionsWithNone = [
    { key: "__none__", label: "(None)" },
    ...crosslistGroupOptions,
  ];

  const instructorLabelById = useMemo(
    () => new Map(instructorOptions.map((o) => [o.key, o.label])),
    [instructorOptions],
  );

  const sectionFilterDefs = useMemo((): EditorColumnFilterDef<SectionRow>[] => [
    {
      columnId: "id",
      label: "ID",
      control: { kind: "multiSearch", textMatch: "startsWith" },
      getValue: ({ section }) => section.id,
    },
    {
      columnId: "dept",
      label: "Dept",
      control: { kind: "multiSelect", showSearch: true },
      getValue: ({ section }) => section.department ?? "",
    },
    {
      columnId: "course",
      label: "Course",
      control: { kind: "multiSearch", textMatch: "contains" },
      getValue: ({ section }) => section.course_id,
    },
    {
      columnId: "code",
      label: "Code",
      control: { kind: "multiSearch", textMatch: "startsWith" },
      getValue: ({ section }) => section.section_code,
    },
    {
      columnId: "state",
      label: "State",
      control: { kind: "multiSelect" },
      options: STATE_OPTIONS,
      getValue: ({ section }) => normalizeSectionState(section.state),
    },
    {
      columnId: "instructor",
      label: "Instructor",
      control: { kind: "multiSelect", showSearch: true },
      options: instructorOptions,
      getValue: ({ section }) => section.instructor_id,
    },
    {
      columnId: "enroll",
      label: "Enroll",
      control: { kind: "numberCompare" },
      getValue: ({ section }) => section.expected_enrollment,
    },
    {
      columnId: "cap",
      label: "Cap",
      control: { kind: "numberCompare" },
      getValue: ({ section }) => section.enrollment_cap,
    },
    {
      columnId: "patterns",
      label: "Patterns",
      control: { kind: "multiSelect", showSearch: true },
      options: meetingPatternOptions,
      arrayValue: true,
      getValue: ({ section }) => section.allowed_meeting_patterns,
    },
  ], [instructorOptions, meetingPatternOptions]);

  const sectionRows = useMemo(
    (): SectionRow[] => sections.map((section, index) => ({ section, index })),
    [sections],
  );

  const filteredSections = useMemo((): SectionRow[] => {
    const query = searchQuery.trim().toLowerCase();
    let rows = sectionRows;
    if (hideArchived) {
      rows = rows.filter(({ section }) => !isSectionArchived(section));
    }
    if (query) {
      rows = rows.filter(({ section }) => {
        const instructorLabel = instructorLabelById.get(section.instructor_id) ?? "";
        const searchable = [
          section.id,
          section.department ?? "",
          section.course_id,
          section.section_code,
          section.instructor_id,
          instructorLabel,
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      });
    }
    return applyEditorColumnFilters(rows, columnFilters, sectionFilterDefs);
  }, [searchQuery, hideArchived, sectionRows, instructorLabelById, columnFilters, sectionFilterDefs]);

  const renderCell = (columnId: string, { section, index: idx }: SectionRow) => {
    switch (columnId) {
      case "id":
        return <EditableCell value={section.id} onChange={(v) => updateSection(idx, "id", v)} />;
      case "dept":
        return (
          <EditableCell
            value={section.department ?? ""}
            onChange={(v) => updateSection(idx, "department", v)}
            placeholder="e.g. FIN"
          />
        );
      case "course":
        return (
          <EditableCell
            value={section.course_id}
            onChange={(v) => updateSection(idx, "course_id", v)}
            placeholder={SECTION_COURSE_PLACEHOLDER}
          />
        );
      case "code":
        return (
          <EditableCell
            value={section.section_code}
            onChange={(v) => updateSection(idx, "section_code", v)}
            placeholder={SECTION_CODE_PLACEHOLDER}
          />
        );
      case "state":
        return (
          <EditableSelectCell
            value={normalizeSectionState(section.state)}
            options={STATE_OPTIONS}
            onChange={(v) => updateSection(idx, "state", v as SectionState)}
            placeholder="State"
          />
        );
      case "instructor":
        return (
          <EditableSelectCell
            value={section.instructor_id}
            options={instructorOptions}
            onChange={(v) => updateSection(idx, "instructor_id", v)}
            placeholder="Select instructor"
          />
        );
      case "enroll":
        return (
          <EditableCell
            type="number"
            value={section.expected_enrollment}
            onChange={(v) => updateSection(idx, "expected_enrollment", v)}
          />
        );
      case "cap":
        return (
          <EditableCell
            type="number"
            value={section.enrollment_cap}
            onChange={(v) => updateSection(idx, "enrollment_cap", v)}
          />
        );
      case "patterns":
        return (
          <MultiSelect
            value={section.allowed_meeting_patterns}
            options={meetingPatternOptions}
            onChange={(v) => updateSection(idx, "allowed_meeting_patterns", v)}
            placeholder="Select patterns"
          />
        );
      case "assigned":
        return (
          <EditableSelectCell
            value={section.previous_meeting_pattern ?? "__none__"}
            options={[{ key: "__none__", label: "(None)" }, ...meetingPatternOptions]}
            onChange={(v) =>
              updateSection(idx, "previous_meeting_pattern", v === "__none__" ? undefined : v)
            }
            placeholder="Pattern"
          />
        );
      case "room_req":
        return (
          <EditableArrayCell
            value={section.room_requirements}
            onChange={(v) => updateSection(idx, "room_requirements", v)}
            placeholder="features"
            nowrapPlaceholder
          />
        );
      case "crosslist":
        return (
          <EditableSelectCell
            value={section.crosslist_group_id ?? "__none__"}
            options={crosslistOptionsWithNone}
            onChange={(v) => updateSection(idx, "crosslist_group_id", v === "__none__" ? null : v)}
            placeholder="None"
          />
        );
      case "tags":
        return (
          <EditableArrayCell
            value={section.tags}
            onChange={(v) => updateSection(idx, "tags", v)}
            placeholder="tags"
            nowrapPlaceholder
          />
        );
      default:
        return null;
    }
  };

  return (
    <EditorTableShell
      title={`Sections (${filteredSections.length})`}
      addLabel="+ Add Section"
      onAdd={addSection}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search sections..."
      searchHint="Search by ID, department, course, code, or instructor."
      filterBar={
        <div className="flex flex-wrap items-center gap-3">
          <EditorColumnFilters
            defs={sectionFilterDefs}
            rows={sectionRows}
            filters={columnFilters}
            onChange={setColumnFilters}
          />
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              className="size-3.5 rounded border-slate-300 text-primary accent-[#137fec]"
              checked={hideArchived}
              onChange={(e) => setHideArchived(e.target.checked)}
            />
            <span>Hide archived sections</span>
          </label>
        </div>
      }
      emptyMessage='No sections. Click "Add Section" to create one.'
      noMatchMessage="No sections match your search or filters."
      isEmpty={sections.length === 0}
      hasNoMatches={sections.length > 0 && filteredSections.length === 0}
    >
      <EditorConfigurableTable
        editorKey="sections"
        columnSpecs={SECTION_COLUMN_SPECS}
        rows={filteredSections}
        getRowKey={({ section, index }) => `${section.id}-${index}`}
        getRowId={({ section }) =>
          `note-sections-${encodeURIComponent(String(section.id))}`
        }
        getRowClassName={({ section }) => {
          const base = "border-t border-default-200";
          if (isRowRecentlyAdded(editorRowKey("sections", String(section.id)))) {
            return recentlyAddedRowClass(base, true);
          }
          if (isSectionArchived(section)) return `${base} opacity-60`;
          if (isSectionNew(section)) return `${base} bg-primary-50/40`;
          return base;
        }}
        renderCell={renderCell}
        renderActions={({ section, index: idx }) => (
          <EditorRowActions
            notes={
              <RowNotesButton
                scope="sections"
                rowId={String(section.id)}
                title={`Section Notes - ${section.department ?? ""} ${section.course_id}`.trim()}
              />
            }
            rowLabel={`section ${section.id} (${section.course_id} ${section.section_code})`}
            onEdit={() => setEditIndex(idx)}
            onDelete={() => deleteSection(idx)}
          />
        )}
      />
      {editIndex !== null && sections[editIndex] ? (
        <SectionEditModal
          isOpen
          section={sections[editIndex]}
          instructorOptions={instructorOptions}
          meetingPatternOptions={meetingPatternOptions}
          crosslistGroupOptions={crosslistGroupOptions}
          onClose={() => setEditIndex(null)}
          onSave={(updated) => {
            const next = [...sections];
            next[editIndex] = updated;
            onUpdate(next);
          }}
        />
      ) : null}
      {addDraft ? (
        <SectionEditModal
          isOpen
          mode="create"
          section={addDraft}
          instructorOptions={instructorOptions}
          meetingPatternOptions={meetingPatternOptions}
          crosslistGroupOptions={crosslistGroupOptions}
          onClose={() => setAddDraft(null)}
          onSave={(created) => {
            onUpdate(insertAtSortedIdPosition(sections, created));
            setAddDraft(null);
            confirmRowAdded({
              rowKey: editorRowKey("sections", String(created.id)),
              message: `Successfully added section ${created.id}.`,
            });
          }}
        />
      ) : null}
    </EditorTableShell>
  );
};

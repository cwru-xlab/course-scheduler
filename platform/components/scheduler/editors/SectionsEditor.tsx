"use client";

import { useMemo, useState } from "react";

import { EditorConfigurableTable } from "./EditorConfigurableTable";
import { EditorRowActions } from "./EditorRowActions";
import { EditorTableShell } from "./EditorTableShell";
import { SECTION_COLUMN_SPECS } from "./editorColumnSpecs";
import { SectionEditModal } from "./modals/SectionEditModal";

import { EditableCell } from "../EditableCell";
import { EditableArrayCell } from "../EditableArrayCell";
import { EditableSelectCell } from "../EditableSelectCell";
import { MultiSelect } from "../MultiSelect";
import { RowNotesButton } from "../RowNotesButton";

import type { Section, SectionState } from "@/lib/scheduling/types";
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

const createEmptySection = (existing: Section[]): Section => ({
  id: nextIntegerId(existing.map((s) => s.id)),
  course_id: "",
  department: "",
  section_code: "A",
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
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const updateSection = (index: number, field: keyof Section, value: unknown) => {
    const newSections = [...sections];
    newSections[index] = { ...newSections[index], [field]: value };
    onUpdate(newSections);
  };

  const addSection = () => {
    onUpdate([...sections, createEmptySection(sections)]);
  };

  const deleteSection = (index: number) => {
    onUpdate(sections.filter((_, i) => i !== index));
  };

  const crosslistOptionsWithNone = [
    { key: "__none__", label: "(None)" },
    ...crosslistGroupOptions,
  ];

  const filteredSections = useMemo((): SectionRow[] => {
    const query = searchQuery.trim().toLowerCase();
    return sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => {
        if (!query) return true;
        const searchable = [
          section.id,
          section.department ?? "",
          section.course_id,
          section.section_code,
          section.instructor_id,
          section.expected_enrollment,
          section.enrollment_cap,
          section.crosslist_group_id ?? "",
          section.previous_meeting_pattern ?? "",
          ...section.allowed_meeting_patterns,
          ...section.room_requirements,
          ...section.tags,
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      });
  }, [searchQuery, sections]);

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
            placeholder="COURSE-XXX"
          />
        );
      case "code":
        return (
          <EditableCell
            value={section.section_code}
            onChange={(v) => updateSection(idx, "section_code", v)}
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
      title={`Sections (${sections.length})`}
      addLabel="+ Add Section"
      onAdd={addSection}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search sections..."
      emptyMessage='No sections. Click "Add Section" to create one.'
      noMatchMessage="No sections match your search."
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
    </EditorTableShell>
  );
};

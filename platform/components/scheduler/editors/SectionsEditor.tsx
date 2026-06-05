"use client";

import { useMemo, useState } from "react";
import { Button } from "@heroui/button";

import { EditorTableShell, editorTd, editorTh } from "./EditorTableShell";

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

  const filteredSections = useMemo(() => {
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
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            <th className={`${editorTh} w-[4%]`}>ID</th>
            <th className={`${editorTh} w-[6%]`}>Dept</th>
            <th className={`${editorTh} w-[8%]`}>Course</th>
            <th className={`${editorTh} w-[4%]`}>Code</th>
            <th className={`${editorTh} w-[5%]`}>State</th>
            <th className={`${editorTh} w-[12%]`}>Instructor</th>
            <th className={`${editorTh} w-[4%]`}>Enroll</th>
            <th className={`${editorTh} w-[4%]`}>Cap</th>
            <th className={`${editorTh} w-[12%]`}>Patterns</th>
            <th className={`${editorTh} w-[9%]`}>Assigned</th>
            <th className={`${editorTh} w-[8%]`}>Room Req</th>
            <th className={`${editorTh} w-[8%]`}>Crosslist</th>
            <th className={`${editorTh} w-[6%]`}>Tags</th>
            <th className={`${editorTh} w-[7%]`}>Notes</th>
            <th className={`${editorTh} w-[3%]`} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {filteredSections.map(({ section, index: idx }) => (
              <tr
                key={`${section.id}-${idx}`}
                id={`note-sections-${encodeURIComponent(String(section.id))}`}
                className={`border-t border-default-200${
                  isSectionArchived(section)
                    ? " opacity-60"
                    : isSectionNew(section)
                      ? " bg-primary-50/40"
                      : ""
                }`}
              >
                <td className={editorTd}>
                  <EditableCell value={section.id} onChange={(v) => updateSection(idx, "id", v)} />
                </td>
                <td className={editorTd}>
                  <EditableCell
                    value={section.department ?? ""}
                    onChange={(v) => updateSection(idx, "department", v)}
                    placeholder="e.g. FIN"
                  />
                </td>
                <td className={editorTd}>
                  <EditableCell value={section.course_id} onChange={(v) => updateSection(idx, "course_id", v)} placeholder="COURSE-XXX" />
                </td>
                <td className={editorTd}>
                  <EditableCell value={section.section_code} onChange={(v) => updateSection(idx, "section_code", v)} />
                </td>
                <td className={editorTd}>
                  <EditableSelectCell
                    value={normalizeSectionState(section.state)}
                    options={STATE_OPTIONS}
                    onChange={(v) => updateSection(idx, "state", v as SectionState)}
                    placeholder="State"
                  />
                </td>
                <td className={editorTd}>
                  <EditableSelectCell
                    value={section.instructor_id}
                    options={instructorOptions}
                    onChange={(v) => updateSection(idx, "instructor_id", v)}
                    placeholder="Select instructor"
                  />
                </td>
                <td className={editorTd}>
                  <EditableCell type="number" value={section.expected_enrollment} onChange={(v) => updateSection(idx, "expected_enrollment", v)} />
                </td>
                <td className={editorTd}>
                  <EditableCell type="number" value={section.enrollment_cap} onChange={(v) => updateSection(idx, "enrollment_cap", v)} />
                </td>
                <td className={editorTd}>
                  <MultiSelect
                    value={section.allowed_meeting_patterns}
                    options={meetingPatternOptions}
                    onChange={(v) => updateSection(idx, "allowed_meeting_patterns", v)}
                    placeholder="Select patterns"
                  />
                </td>
                <td className={editorTd}>
                  <EditableSelectCell
                    value={section.previous_meeting_pattern ?? "__none__"}
                    options={[{ key: "__none__", label: "(None)" }, ...meetingPatternOptions]}
                    onChange={(v) =>
                      updateSection(idx, "previous_meeting_pattern", v === "__none__" ? undefined : v)
                    }
                    placeholder="Pattern"
                  />
                </td>
                <td className={editorTd}>
                  <EditableArrayCell value={section.room_requirements} onChange={(v) => updateSection(idx, "room_requirements", v)} placeholder="features" />
                </td>
                <td className={editorTd}>
                  <EditableSelectCell
                    value={section.crosslist_group_id ?? "__none__"}
                    options={crosslistOptionsWithNone}
                    onChange={(v) => updateSection(idx, "crosslist_group_id", v === "__none__" ? null : v)}
                    placeholder="None"
                  />
                </td>
                <td className={editorTd}>
                  <EditableArrayCell value={section.tags} onChange={(v) => updateSection(idx, "tags", v)} placeholder="tags" />
                </td>
                <td className={editorTd}>
                  <RowNotesButton
                    scope="sections"
                    rowId={String(section.id)}
                    title={`Section Notes - ${section.department ?? ""} ${section.course_id}`.trim()}
                  />
                </td>
                <td className={editorTd}>
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteSection(idx)}>
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

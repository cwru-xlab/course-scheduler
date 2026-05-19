"use client";

import { useMemo, useState } from "react";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input } from "@heroui/input";

import { EditableCell } from "../EditableCell";
import { EditableArrayCell } from "../EditableArrayCell";
import { EditableSelectCell } from "../EditableSelectCell";
import { MultiSelect } from "../MultiSelect";
import { RowNotesButton } from "../RowNotesButton";

import type { Section, SectionState } from "@/lib/scheduling/types";
import { nextIntegerId } from "@/lib/scheduling/nextId";
import { isSectionArchived, normalizeSectionState } from "@/lib/scheduling/sectionState";

const STATE_OPTIONS: { key: SectionState; label: string }[] = [
  { key: "active", label: "Active" },
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
  state: "active",
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Sections ({sections.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addSection}>
          + Add Section
        </Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <Input
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search sections..."
          size="sm"
          className="mb-3 max-w-md"
          isClearable
        />
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">ID</th>
              <th className="pb-2 pr-3">Department</th>
              <th className="pb-2 pr-3">Course</th>
              <th className="pb-2 pr-3">Code</th>
              <th className="pb-2 pr-3">State</th>
              <th className="pb-2 pr-3">Instructor</th>
              <th className="pb-2 pr-3">Enroll</th>
              <th className="pb-2 pr-3">Cap</th>
              <th className="pb-2 pr-3">Meeting Patterns</th>
              <th className="pb-2 pr-3">Assigned Pattern</th>
              <th className="pb-2 pr-3">Room Req</th>
              <th className="pb-2 pr-3">Crosslist Group</th>
              <th className="pb-2 pr-3">Tags</th>
              <th className="pb-2 pr-3">View Notes</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredSections.map(({ section, index: idx }) => (
              <tr
                key={`${section.id}-${idx}`}
                id={`note-sections-${encodeURIComponent(String(section.id))}`}
                className={`border-t border-default-200${isSectionArchived(section) ? " opacity-60" : ""}`}
              >
                <td className="py-2 pr-3">
                  <EditableCell value={section.id} onChange={(v) => updateSection(idx, "id", v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell
                    value={section.department ?? ""}
                    onChange={(v) => updateSection(idx, "department", v)}
                    placeholder="e.g. FIN"
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={section.course_id} onChange={(v) => updateSection(idx, "course_id", v)} placeholder="COURSE-XXX" />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={section.section_code} onChange={(v) => updateSection(idx, "section_code", v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={normalizeSectionState(section.state)}
                    options={STATE_OPTIONS}
                    onChange={(v) => updateSection(idx, "state", v as SectionState)}
                    placeholder="State"
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={section.instructor_id}
                    options={instructorOptions}
                    onChange={(v) => updateSection(idx, "instructor_id", v)}
                    placeholder="Select instructor"
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell type="number" value={section.expected_enrollment} onChange={(v) => updateSection(idx, "expected_enrollment", v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell type="number" value={section.enrollment_cap} onChange={(v) => updateSection(idx, "enrollment_cap", v)} />
                </td>
                <td className="py-2 pr-3">
                  <MultiSelect
                    value={section.allowed_meeting_patterns}
                    options={meetingPatternOptions}
                    onChange={(v) => updateSection(idx, "allowed_meeting_patterns", v)}
                    placeholder="Select patterns"
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={section.previous_meeting_pattern ?? "__none__"}
                    options={[{ key: "__none__", label: "(None)" }, ...meetingPatternOptions]}
                    onChange={(v) =>
                      updateSection(idx, "previous_meeting_pattern", v === "__none__" ? undefined : v)
                    }
                    placeholder="Pattern"
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableArrayCell value={section.room_requirements} onChange={(v) => updateSection(idx, "room_requirements", v)} placeholder="features" />
                </td>
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={section.crosslist_group_id ?? "__none__"}
                    options={crosslistOptionsWithNone}
                    onChange={(v) => updateSection(idx, "crosslist_group_id", v === "__none__" ? null : v)}
                    placeholder="None"
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableArrayCell value={section.tags} onChange={(v) => updateSection(idx, "tags", v)} placeholder="tags" />
                </td>
                <td className="py-2 pr-3">
                  <RowNotesButton
                    scope="sections"
                    rowId={String(section.id)}
                    title={`Section Notes - ${section.department ?? ""} ${section.course_id}`.trim()}
                  />
                </td>
                <td className="py-2 pr-3">
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteSection(idx)}>
                    ✕
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sections.length === 0 && (
          <div className="py-4 text-center text-default-400">No sections. Click "Add Section" to create one.</div>
        )}
        {sections.length > 0 && filteredSections.length === 0 && (
          <div className="py-4 text-center text-default-400">No sections match your search.</div>
        )}
      </CardBody>
    </Card>
  );
};

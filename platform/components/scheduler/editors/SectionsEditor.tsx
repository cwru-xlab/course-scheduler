"use client";

import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";

import { EditableCell } from "../EditableCell";
import { EditableArrayCell } from "../EditableArrayCell";
import { EditableSelectCell } from "../EditableSelectCell";

import type { Section } from "@/lib/scheduling/types";

type SectionsEditorProps = {
  sections: Section[];
  instructorIds: string[];
  meetingPatternIds: string[];
  crosslistGroupIds: string[];
  onUpdate: (sections: Section[]) => void;
};

const createEmptySection = (): Section => ({
  id: `SEC-NEW-${Date.now()}`,
  course_id: "",
  section_code: "A",
  instructor_id: "",
  expected_enrollment: 20,
  enrollment_cap: 30,
  allowed_meeting_patterns: [],
  room_requirements: [],
  crosslist_group_id: null,
  tags: [],
});

export const SectionsEditor = ({
  sections,
  instructorIds,
  meetingPatternIds,
  crosslistGroupIds,
  onUpdate,
}: SectionsEditorProps) => {
  const updateSection = (index: number, field: keyof Section, value: unknown) => {
    const newSections = [...sections];
    newSections[index] = { ...newSections[index], [field]: value };
    onUpdate(newSections);
  };

  const addSection = () => {
    onUpdate([...sections, createEmptySection()]);
  };

  const deleteSection = (index: number) => {
    onUpdate(sections.filter((_, i) => i !== index));
  };

  const instructorOptions = instructorIds.map((id) => ({ key: id, label: id }));
  const crosslistOptions = [
    { key: "__none__", label: "None" },
    ...crosslistGroupIds.map((id) => ({ key: id, label: id })),
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Sections ({sections.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addSection}>
          + Add Section
        </Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">ID</th>
              <th className="pb-2 pr-3">Course</th>
              <th className="pb-2 pr-3">Code</th>
              <th className="pb-2 pr-3">Instructor</th>
              <th className="pb-2 pr-3">Enroll</th>
              <th className="pb-2 pr-3">Cap</th>
              <th className="pb-2 pr-3">Patterns</th>
              <th className="pb-2 pr-3">Room Req</th>
              <th className="pb-2 pr-3">Crosslist</th>
              <th className="pb-2 pr-3">Tags</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section, idx) => (
              <tr key={`${section.id}-${idx}`} className="border-t border-default-200">
                <td className="py-2 pr-3">
                  <EditableCell value={section.id} onChange={(v) => updateSection(idx, "id", v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={section.course_id} onChange={(v) => updateSection(idx, "course_id", v)} placeholder="COURSE-XXX" />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={section.section_code} onChange={(v) => updateSection(idx, "section_code", v)} />
                </td>
                <td className="py-2 pr-3">
                  {instructorOptions.length > 0 ? (
                    <EditableSelectCell
                      value={section.instructor_id}
                      options={instructorOptions}
                      onChange={(v) => updateSection(idx, "instructor_id", v)}
                      placeholder="Select..."
                    />
                  ) : (
                    <EditableCell value={section.instructor_id} onChange={(v) => updateSection(idx, "instructor_id", v)} />
                  )}
                </td>
                <td className="py-2 pr-3">
                  <EditableCell type="number" value={section.expected_enrollment} onChange={(v) => updateSection(idx, "expected_enrollment", v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell type="number" value={section.enrollment_cap} onChange={(v) => updateSection(idx, "enrollment_cap", v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableArrayCell value={section.allowed_meeting_patterns} onChange={(v) => updateSection(idx, "allowed_meeting_patterns", v)} placeholder="patterns" />
                </td>
                <td className="py-2 pr-3">
                  <EditableArrayCell value={section.room_requirements} onChange={(v) => updateSection(idx, "room_requirements", v)} placeholder="features" />
                </td>
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={section.crosslist_group_id ?? "__none__"}
                    options={crosslistOptions}
                    onChange={(v) => updateSection(idx, "crosslist_group_id", v === "__none__" ? null : v)}
                    placeholder="None"
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableArrayCell value={section.tags} onChange={(v) => updateSection(idx, "tags", v)} placeholder="tags" />
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
      </CardBody>
    </Card>
  );
};

"use client";

import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";

import { EditableCell } from "../EditableCell";
import { EditableSelectCell } from "../EditableSelectCell";
import { MultiSelect } from "../MultiSelect";

import type { Instructor } from "@/lib/scheduling/types";

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

const createEmptyInstructor = (): Instructor => ({
  id: `INST-NEW-${Date.now()}`,
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
    onUpdate([...instructors, createEmptyInstructor()]);
  };

  const deleteInstructor = (index: number) => {
    onUpdate(instructors.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Instructors ({instructors.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addInstructor}>
          + Add Instructor
        </Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">ID</th>
              <th className="pb-2 pr-3">Rank</th>
              <th className="pb-2 pr-3">Unavailable Times</th>
              <th className="pb-2 pr-3">Preferred Days</th>
              <th className="pb-2 pr-3">Preferred Patterns</th>
              <th className="pb-2 pr-3">Max Days</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {instructors.map((inst, idx) => (
              <tr key={`${inst.id}-${idx}`} className="border-t border-default-200">
                <td className="py-2 pr-3">
                  <EditableCell value={inst.id} onChange={(v) => updateInstructor(idx, "id", v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableSelectCell
                    value={inst.rank_type}
                    options={RANK_OPTIONS}
                    onChange={(v) => updateInstructor(idx, "rank_type", v)}
                  />
                </td>
                <td className="py-2 pr-3">
                  <MultiSelect
                    value={inst.unavailable_times}
                    options={timeslotOptions}
                    onChange={(v) => updateInstructor(idx, "unavailable_times", v)}
                    placeholder="Select timeslots"
                  />
                </td>
                <td className="py-2 pr-3">
                  <MultiSelect
                    value={inst.preferences.preferred_days}
                    options={DAY_OPTIONS}
                    onChange={(v) => updateInstructor(idx, "preferences.preferred_days", v)}
                    placeholder="Select days"
                  />
                </td>
                <td className="py-2 pr-3">
                  <MultiSelect
                    value={inst.preferences.preferred_patterns}
                    options={meetingPatternOptions}
                    onChange={(v) => updateInstructor(idx, "preferences.preferred_patterns", v)}
                    placeholder="Select patterns"
                  />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell
                    type="number"
                    value={inst.preferences.max_teaching_days ?? ""}
                    onChange={(v) => updateInstructor(idx, "preferences.max_teaching_days", v || undefined)}
                    placeholder="—"
                  />
                </td>
                <td className="py-2 pr-3">
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteInstructor(idx)}>
                    ✕
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {instructors.length === 0 && (
          <div className="py-4 text-center text-default-400">No instructors. Click "Add Instructor" to create one.</div>
        )}
      </CardBody>
    </Card>
  );
};

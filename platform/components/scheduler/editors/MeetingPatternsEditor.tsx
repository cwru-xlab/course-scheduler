"use client";

import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";

import { EditableCell } from "../EditableCell";
import { MultiSelect } from "../MultiSelect";

import type { MeetingPattern } from "@/lib/scheduling/types";

type MeetingPatternsEditorProps = {
  meetingPatterns: MeetingPattern[];
  timeslotOptions: { key: string; label: string }[];
  onUpdate: (patterns: MeetingPattern[]) => void;
};

const DAY_OPTIONS = [
  { key: "Mon", label: "Mon" },
  { key: "Tue", label: "Tue" },
  { key: "Wed", label: "Wed" },
  { key: "Thu", label: "Thu" },
  { key: "Fri", label: "Fri" },
  { key: "Sat", label: "Sat" },
  { key: "Sun", label: "Sun" },
];

const createEmptyMeetingPattern = (): MeetingPattern => ({
  id: `MP-NEW-${Date.now()}`,
  slots_required: 2,
  allowed_days: [],
  compatible_timeslot_sets: [],
});

export const MeetingPatternsEditor = ({
  meetingPatterns,
  timeslotOptions,
  onUpdate,
}: MeetingPatternsEditorProps) => {
  const updatePattern = (index: number, field: keyof MeetingPattern, value: unknown) => {
    const newPatterns = [...meetingPatterns];
    newPatterns[index] = { ...newPatterns[index], [field]: value };
    onUpdate(newPatterns);
  };

  const addPattern = () => {
    onUpdate([...meetingPatterns, createEmptyMeetingPattern()]);
  };

  const deletePattern = (index: number) => {
    onUpdate(meetingPatterns.filter((_, i) => i !== index));
  };

  const addTimeslotSet = (patternIndex: number) => {
    const newPatterns = [...meetingPatterns];
    newPatterns[patternIndex] = {
      ...newPatterns[patternIndex],
      compatible_timeslot_sets: [...newPatterns[patternIndex].compatible_timeslot_sets, []],
    };
    onUpdate(newPatterns);
  };

  const updateTimeslotSet = (patternIndex: number, setIndex: number, value: string[]) => {
    const newPatterns = [...meetingPatterns];
    const newSets = [...newPatterns[patternIndex].compatible_timeslot_sets];
    newSets[setIndex] = value;
    newPatterns[patternIndex] = { ...newPatterns[patternIndex], compatible_timeslot_sets: newSets };
    onUpdate(newPatterns);
  };

  const deleteTimeslotSet = (patternIndex: number, setIndex: number) => {
    const newPatterns = [...meetingPatterns];
    newPatterns[patternIndex] = {
      ...newPatterns[patternIndex],
      compatible_timeslot_sets: newPatterns[patternIndex].compatible_timeslot_sets.filter((_, i) => i !== setIndex),
    };
    onUpdate(newPatterns);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Meeting Patterns ({meetingPatterns.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addPattern}>
          + Add Pattern
        </Button>
      </CardHeader>
      <CardBody className="space-y-4 text-sm">
        {meetingPatterns.map((pattern, idx) => (
          <div key={`${pattern.id}-${idx}`} className="border border-default-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-default-500">ID:</span>
                  <EditableCell value={pattern.id} onChange={(v) => updatePattern(idx, "id", v)} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-default-500">Slots:</span>
                  <EditableCell type="number" value={pattern.slots_required} onChange={(v) => updatePattern(idx, "slots_required", v)} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-default-500">Days:</span>
                  <MultiSelect
                    value={pattern.allowed_days}
                    options={DAY_OPTIONS}
                    onChange={(v) => updatePattern(idx, "allowed_days", v)}
                    placeholder="Select days"
                  />
                </div>
              </div>
              <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deletePattern(idx)}>
                ✕
              </Button>
            </div>
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-default-500 text-xs">Compatible Timeslot Sets:</span>
                <Button size="sm" variant="light" onPress={() => addTimeslotSet(idx)}>
                  + Add Set
                </Button>
              </div>
              {pattern.compatible_timeslot_sets.length === 0 ? (
                <div className="text-default-400 text-xs">No timeslot sets defined.</div>
              ) : (
                <div className="space-y-1">
                  {pattern.compatible_timeslot_sets.map((set, setIdx) => (
                    <div key={setIdx} className="flex items-center gap-2 bg-default-50 rounded px-2 py-1">
                      <span className="text-default-400 text-xs whitespace-nowrap">Set {setIdx + 1}:</span>
                      <MultiSelect
                        value={set}
                        options={timeslotOptions}
                        onChange={(v) => updateTimeslotSet(idx, setIdx, v)}
                        placeholder="Select timeslots"
                      />
                      <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteTimeslotSet(idx, setIdx)}>
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {meetingPatterns.length === 0 && (
          <div className="py-4 text-center text-default-400">No meeting patterns. Click "Add Pattern" to create one.</div>
        )}
      </CardBody>
    </Card>
  );
};

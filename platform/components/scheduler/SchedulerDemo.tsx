"use client";

import { useMemo, useState } from "react";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Tabs, Tab } from "@heroui/tabs";

import { SectionsEditor } from "./editors/SectionsEditor";
import { InstructorsEditor } from "./editors/InstructorsEditor";
import { RoomsEditor } from "./editors/RoomsEditor";
import { TimeslotsEditor } from "./editors/TimeslotsEditor";
import { MeetingPatternsEditor } from "./editors/MeetingPatternsEditor";
import {
  CrossListGroupsEditor,
  NoOverlapGroupsEditor,
  BlockedTimesEditor,
  LockedAssignmentsEditor,
  SoftLocksEditor,
} from "./editors/ConstraintsEditors";

import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";
import type { ScheduleSolution, ValidationError } from "@/lib/scheduling/types";

type ApiSuccess = ScheduleSolution & { status: "ok" };
type ApiError = {
  status: "error";
  errors: ValidationError[];
  diagnostics?: {
    feasible_if_relax?: string[];
    feasible_if_remove_section?: string[];
  };
};

export const SchedulerDemo = () => {
  const {
    data,
    isLoading,
    error,
    isFromLocalStorage,
    updateField,
    resetToMockData,
    hasUnsavedChanges,
  } = useSchedulingData();

  const [solution, setSolution] = useState<ScheduleSolution | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [diagnostics, setDiagnostics] = useState<ApiError["diagnostics"]>();
  const [solverStatus, setSolverStatus] = useState<"idle" | "loading">("idle");

  const timeslotLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    data?.timeslots.forEach((slot) => {
      map.set(slot.id, `${slot.day} ${slot.start_time}-${slot.end_time}`);
    });
    return map;
  }, [data]);

  // Derived options for dropdowns (with labels)
  const sectionOptions = useMemo(
    () => data?.sections.map((s) => ({ key: s.id, label: `${s.id} (${s.course_id})` })) ?? [],
    [data]
  );

  const instructorOptions = useMemo(
    () => data?.instructors.map((i) => ({ key: i.id, label: `${i.id} (${i.rank_type})` })) ?? [],
    [data]
  );

  const roomOptions = useMemo(
    () => data?.rooms.map((r) => ({ key: r.id, label: `${r.id} (${r.building}, cap: ${r.capacity})` })) ?? [],
    [data]
  );

  const timeslotOptions = useMemo(
    () => data?.timeslots.map((t) => ({ key: t.id, label: `${t.day} ${t.start_time}-${t.end_time}` })) ?? [],
    [data]
  );

  const meetingPatternOptions = useMemo(
    () => data?.meeting_patterns.map((p) => ({ key: p.id, label: `${p.id} (${p.allowed_days.join("/")})` })) ?? [],
    [data]
  );

  const crosslistGroupOptions = useMemo(
    () => data?.crosslist_groups.map((g) => ({ key: g.id, label: g.id })) ?? [],
    [data]
  );

  const runSolver = async () => {
    if (!data) return;
    setSolverStatus("loading");
    setErrors([]);
    setSolution(null);
    setDiagnostics(undefined);

    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = (await response.json()) as ApiSuccess | ApiError;

      if (!response.ok || result.status === "error") {
        setErrors(
          result.status === "error"
            ? result.errors
            : [{ code: "unknown", message: "Unknown solver error." }]
        );
        if (result.status === "error") {
          setDiagnostics(result.diagnostics);
        }
      } else {
        setSolution(result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reach solver API.";
      setErrors([{ code: "network_error", message }]);
    } finally {
      setSolverStatus("idle");
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading scheduling data...</div>;
  }

  if (error) {
    return <div className="p-4 text-danger">Error: {error}</div>;
  }

  if (!data) {
    return <div className="p-4">No data available.</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Status Bar */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-col items-start gap-1">
            <h2 className="text-xl font-semibold">Scheduling Data Editor</h2>
            <div className="flex items-center gap-2 text-sm text-default-500">
              <span>Data source:</span>
              <Chip size="sm" color={isFromLocalStorage ? "success" : "primary"} variant="flat">
                {isFromLocalStorage ? "Local Storage" : "Mock Data"}
              </Chip>
              {hasUnsavedChanges && (
                <Chip size="sm" color="warning" variant="flat">Saving...</Chip>
              )}
            </div>
          </div>
          <Button color="danger" variant="flat" size="sm" onPress={resetToMockData}>
            Reset to Mock Data
          </Button>
        </CardHeader>
        <CardBody className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
          <div>Sections: {data.sections.length}</div>
          <div>Instructors: {data.instructors.length}</div>
          <div>Rooms: {data.rooms.length}</div>
          <div>Timeslots: {data.timeslots.length}</div>
          <div>Patterns: {data.meeting_patterns.length}</div>
          <div>Cross-list: {data.crosslist_groups.length}</div>
          <div>No-Overlap: {data.no_overlap_groups.length}</div>
          <div>Blocked: {data.blocked_times.length}</div>
          <div>Hard Locks: {data.locked_assignments.length}</div>
          <div>Soft Locks: {data.soft_locks.length}</div>
        </CardBody>
      </Card>

      {/* Validation Errors */}
      {errors.length > 0 && (
        <Card className="border border-danger-200">
          <CardHeader>
            <h3 className="text-lg font-semibold text-danger">Validation Errors</h3>
          </CardHeader>
          <CardBody className="space-y-2 text-sm text-danger-600">
            {errors.map((err) => (
              <div key={`${err.code}-${err.message}`}>{err.code}: {err.message}</div>
            ))}
            {diagnostics?.feasible_if_relax?.length ? (
              <div className="pt-2 text-default-600">
                Try relaxing: {diagnostics.feasible_if_relax.join(", ")}.
              </div>
            ) : null}
            {diagnostics?.feasible_if_remove_section?.length ? (
              <div className="text-default-600">
                Feasible if remove section(s): {diagnostics.feasible_if_remove_section.join(", ")}.
              </div>
            ) : null}
          </CardBody>
        </Card>
      )}

      {/* Tabbed Editors */}
      <Tabs aria-label="Data editors" color="primary" variant="bordered">
        <Tab key="sections" title="Sections">
          <SectionsEditor
            sections={data.sections}
            instructorOptions={instructorOptions}
            meetingPatternOptions={meetingPatternOptions}
            crosslistGroupOptions={crosslistGroupOptions}
            onUpdate={(sections) => updateField("sections", sections)}
          />
        </Tab>
        <Tab key="instructors" title="Instructors">
          <InstructorsEditor
            instructors={data.instructors}
            meetingPatternOptions={meetingPatternOptions}
            timeslotOptions={timeslotOptions}
            onUpdate={(instructors) => updateField("instructors", instructors)}
          />
        </Tab>
        <Tab key="rooms" title="Rooms">
          <RoomsEditor
            rooms={data.rooms}
            onUpdate={(rooms) => updateField("rooms", rooms)}
          />
        </Tab>
        <Tab key="timeslots" title="Timeslots">
          <TimeslotsEditor
            timeslots={data.timeslots}
            onUpdate={(timeslots) => updateField("timeslots", timeslots)}
          />
        </Tab>
        <Tab key="patterns" title="Meeting Patterns">
          <MeetingPatternsEditor
            meetingPatterns={data.meeting_patterns}
            timeslotOptions={timeslotOptions}
            onUpdate={(patterns) => updateField("meeting_patterns", patterns)}
          />
        </Tab>
        <Tab key="constraints" title="Constraints">
          <div className="flex flex-col gap-4">
            <CrossListGroupsEditor
              groups={data.crosslist_groups}
              sectionOptions={sectionOptions}
              onUpdate={(groups) => updateField("crosslist_groups", groups)}
            />
            <NoOverlapGroupsEditor
              groups={data.no_overlap_groups}
              sectionOptions={sectionOptions}
              onUpdate={(groups) => updateField("no_overlap_groups", groups)}
            />
            <BlockedTimesEditor
              blockedTimes={data.blocked_times}
              timeslotOptions={timeslotOptions}
              onUpdate={(blockedTimes) => updateField("blocked_times", blockedTimes)}
            />
            <LockedAssignmentsEditor
              lockedAssignments={data.locked_assignments}
              sectionOptions={sectionOptions}
              timeslotOptions={timeslotOptions}
              roomOptions={roomOptions}
              onUpdate={(locks) => updateField("locked_assignments", locks)}
            />
            <SoftLocksEditor
              softLocks={data.soft_locks}
              sectionOptions={sectionOptions}
              timeslotOptions={timeslotOptions}
              roomOptions={roomOptions}
              onUpdate={(locks) => updateField("soft_locks", locks)}
            />
          </div>
        </Tab>
      </Tabs>

      {/* Run Solver Button */}
      <div className="flex items-center gap-3">
        <Button color="primary" radius="full" onPress={runSolver} isLoading={solverStatus === "loading"}>
          Run Solver
        </Button>
        <span className="text-sm text-default-500">
          Uses current edited data (auto-saved to local storage)
        </span>
      </div>

      {/* Solution Display */}
      {solution && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Assignments</h3>
            </CardHeader>
            <CardBody className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-default-500">
                  <tr>
                    <th className="pb-2 pr-4">Section</th>
                    <th className="pb-2 pr-4">Pattern</th>
                    <th className="pb-2 pr-4">Times</th>
                    <th className="pb-2 pr-4">Room</th>
                  </tr>
                </thead>
                <tbody>
                  {solution.assignments.map((a) => (
                    <tr key={a.section_id} className="border-t border-default-200">
                      <td className="py-2 pr-4 font-medium">{a.section_id}</td>
                      <td className="py-2 pr-4">{a.meeting_pattern_id}</td>
                      <td className="py-2 pr-4">
                        {a.timeslot_ids.map((id) => timeslotLabelMap.get(id) ?? id).join(", ")}
                      </td>
                      <td className="py-2 pr-4">{a.room_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Score: {solution.total_score.toFixed(2)}</h3>
            </CardHeader>
            <CardBody className="text-sm space-y-1">
              {Object.entries(solution.penalty_breakdown).map(([key, value]) => (
                <div key={key}>{key.replace(/_/g, " ")}: {value.toFixed(2)}</div>
              ))}
            </CardBody>
          </Card>

          {solution.explanations.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">Explanations</h3>
              </CardHeader>
              <CardBody className="space-y-2 text-sm text-default-600">
                {solution.explanations.map((explanation, idx) => (
                  <div key={idx}>{explanation}</div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

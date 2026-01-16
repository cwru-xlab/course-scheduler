"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";

import type {
  ScheduleSolution,
  SchedulingInput,
  ValidationError,
} from "@/lib/scheduling/types";

type ApiSuccess = ScheduleSolution & { status: "ok" };
type ApiError = {
  status: "error";
  errors: ValidationError[];
  diagnostics?: {
    feasible_if_relax?: string[];
    feasible_if_remove_section?: string[];
  };
};

const buildTimeslotLabelMapFromData = (data: SchedulingInput | null) => {
  const map = new Map<string, string>();
  data?.timeslots.forEach((slot) => {
    map.set(slot.id, `${slot.day} ${slot.start_time}-${slot.end_time}`);
  });
  return map;
};

export const SchedulerDemo = () => {
  const [mockData, setMockData] = useState<SchedulingInput | null>(null);
  const [mockDataStatus, setMockDataStatus] = useState<"idle" | "loading">(
    "idle"
  );
  const [mockDataError, setMockDataError] = useState<string | null>(null);
  const [solution, setSolution] = useState<ScheduleSolution | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [diagnostics, setDiagnostics] = useState<ApiError["diagnostics"]>();
  const [status, setStatus] = useState<"idle" | "loading">("idle");

  const timeslotLabelMap = useMemo(
    () => buildTimeslotLabelMapFromData(mockData),
    [mockData]
  );

  useEffect(() => {
    let isMounted = true;
    const loadMockData = async () => {
      setMockDataStatus("loading");
      setMockDataError(null);
      try {
        const response = await fetch("/api/mock-data", { method: "GET" });
        const data = (await response.json()) as {
          status: "ok" | "error";
          data?: SchedulingInput;
          error?: string;
        };
        if (!response.ok || data.status !== "ok" || !data.data) {
          throw new Error(data.error ?? "Failed to load mock data.");
        }
        if (isMounted) {
          setMockData(data.data);
        }
      } catch (error) {
        if (isMounted) {
          setMockDataError(
            error instanceof Error ? error.message : "Failed to load mock data."
          );
        }
      } finally {
        if (isMounted) {
          setMockDataStatus("idle");
        }
      }
    };
    loadMockData();
    return () => {
      isMounted = false;
    };
  }, []);

  const runSolver = async () => {
    setStatus("loading");
    setErrors([]);
    setSolution(null);
    setDiagnostics(undefined);

    try {
      const response = await fetch("/api/schedule", { method: "POST" });
      const data = (await response.json()) as ApiSuccess | ApiError;

      if (!response.ok || data.status === "error") {
        setErrors(
          data.status === "error"
            ? data.errors
            : [{ code: "unknown", message: "Unknown solver error." }]
        );
        if (data.status === "error") {
          setDiagnostics(data.diagnostics);
        }
      } else {
        setSolution(data);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reach solver API.";
      setErrors([{ code: "network_error", message }]);
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-col items-start gap-1">
          <h2 className="text-xl font-semibold">Mock Input Snapshot</h2>
          <p className="text-sm text-default-500">
            Loaded from{" "}
            <code className="text-default-700">GET /api/mock-data</code>.
          </p>
        </CardHeader>
        <CardBody className="grid gap-3 text-sm sm:grid-cols-2">
          {mockDataStatus === "loading" && <div>Loading mock data...</div>}
          {mockDataError && (
            <div className="text-danger">Error: {mockDataError}</div>
          )}
          {mockData && (
            <>
              <div>Sections: {mockData.sections.length}</div>
              <div>Rooms: {mockData.rooms.length}</div>
              <div>Instructors: {mockData.instructors.length}</div>
              <div>Timeslots: {mockData.timeslots.length}</div>
              <div>Meeting Patterns: {mockData.meeting_patterns.length}</div>
              <div>
                Constraints:{" "}
                {mockData.crosslist_groups.length +
                  mockData.no_overlap_groups.length}
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {errors.length > 0 && (
        <Card className="border border-danger-200">
          <CardHeader>
            <h3 className="text-lg font-semibold text-danger">
              Validation Errors
            </h3>
          </CardHeader>
          <CardBody className="space-y-2 text-sm text-danger-600">
            {errors.map((error) => (
              <div key={`${error.code}-${error.message}`}>
                {error.code}: {error.message}
              </div>
            ))}
            {diagnostics?.feasible_if_relax?.length ? (
              <div className="pt-2 text-default-600">
                Try relaxing: {diagnostics.feasible_if_relax.join(", ")}.
              </div>
            ) : null}
            {diagnostics?.feasible_if_remove_section?.length ? (
              <div className="text-default-600">
                Feasible if remove section(s):{" "}
                {diagnostics.feasible_if_remove_section.join(", ")}.
              </div>
            ) : null}
          </CardBody>
        </Card>
      )}

      {mockData && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Sections</h3>
            </CardHeader>
            <CardBody className="overflow-x-auto text-sm">
              <table className="min-w-full">
                <thead className="text-left text-default-500">
                  <tr>
                    <th className="pb-2 pr-4">ID</th>
                    <th className="pb-2 pr-4">Instructor</th>
                    <th className="pb-2 pr-4">Enrollment</th>
                    <th className="pb-2 pr-4">Patterns</th>
                    <th className="pb-2 pr-4">Cross-list</th>
                  </tr>
                </thead>
                <tbody>
                  {mockData.sections.map((section) => (
                    <tr
                      key={section.id}
                      className="border-t border-default-200"
                    >
                      <td className="py-2 pr-4 font-medium">{section.id}</td>
                      <td className="py-2 pr-4">{section.instructor_id}</td>
                      <td className="py-2 pr-4">
                        {section.expected_enrollment}/{section.enrollment_cap}
                      </td>
                      <td className="py-2 pr-4">
                        {section.allowed_meeting_patterns.join(", ")}
                      </td>
                      <td className="py-2 pr-4">
                        {section.crosslist_group_id ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Instructors</h3>
            </CardHeader>
            <CardBody className="overflow-x-auto text-sm">
              <table className="min-w-full">
                <thead className="text-left text-default-500">
                  <tr>
                    <th className="pb-2 pr-4">ID</th>
                    <th className="pb-2 pr-4">Rank</th>
                    <th className="pb-2 pr-4">Preferred Days</th>
                    <th className="pb-2 pr-4">Preferred Patterns</th>
                  </tr>
                </thead>
                <tbody>
                  {mockData.instructors.map((inst) => (
                    <tr key={inst.id} className="border-t border-default-200">
                      <td className="py-2 pr-4 font-medium">{inst.id}</td>
                      <td className="py-2 pr-4">{inst.rank_type}</td>
                      <td className="py-2 pr-4">
                        {inst.preferences.preferred_days.join(", ")}
                      </td>
                      <td className="py-2 pr-4">
                        {inst.preferences.preferred_patterns.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Rooms</h3>
            </CardHeader>
            <CardBody className="overflow-x-auto text-sm">
              <table className="min-w-full">
                <thead className="text-left text-default-500">
                  <tr>
                    <th className="pb-2 pr-4">ID</th>
                    <th className="pb-2 pr-4">Capacity</th>
                    <th className="pb-2 pr-4">Features</th>
                  </tr>
                </thead>
                <tbody>
                  {mockData.rooms.map((room) => (
                    <tr key={room.id} className="border-t border-default-200">
                      <td className="py-2 pr-4 font-medium">{room.id}</td>
                      <td className="py-2 pr-4">{room.capacity}</td>
                      <td className="py-2 pr-4">
                        {room.features.length ? room.features.join(", ") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Timeslots</h3>
            </CardHeader>
            <CardBody className="overflow-x-auto text-sm">
              <table className="min-w-full">
                <thead className="text-left text-default-500">
                  <tr>
                    <th className="pb-2 pr-4">ID</th>
                    <th className="pb-2 pr-4">Day</th>
                    <th className="pb-2 pr-4">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {mockData.timeslots.map((slot) => (
                    <tr key={slot.id} className="border-t border-default-200">
                      <td className="py-2 pr-4 font-medium">{slot.id}</td>
                      <td className="py-2 pr-4">{slot.day}</td>
                      <td className="py-2 pr-4">
                        {slot.start_time}-{slot.end_time}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Meeting Patterns</h3>
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              {mockData.meeting_patterns.map((pattern) => (
                <div
                  key={pattern.id}
                  className="border-b border-default-200 pb-3"
                >
                  <div className="font-medium">{pattern.id}</div>
                  <div>Days: {pattern.allowed_days.join(", ")}</div>
                  <div>Slots: {pattern.slots_required}</div>
                  <div>
                    Sets:{" "}
                    {pattern.compatible_timeslot_sets
                      .map((set) => set.join(", "))
                      .join(" | ")}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Constraints</h3>
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              <div>
                <div className="font-medium">Cross-list Groups</div>
                {mockData.crosslist_groups.length ? (
                  mockData.crosslist_groups.map((group) => (
                    <div key={group.id}>
                      {group.id}: {group.member_section_ids.join(", ")} (same
                      room: {group.require_same_room ? "yes" : "no"})
                    </div>
                  ))
                ) : (
                  <div>None</div>
                )}
              </div>
              <div>
                <div className="font-medium">No-Overlap Groups</div>
                {mockData.no_overlap_groups.length ? (
                  mockData.no_overlap_groups.map((group) => (
                    <div key={group.id}>
                      {group.id}: {group.member_section_ids.join(", ")} (
                      {group.reason})
                    </div>
                  ))
                ) : (
                  <div>None</div>
                )}
              </div>
              <div>
                <div className="font-medium">Blocked Times</div>
                {mockData.blocked_times.length ? (
                  mockData.blocked_times.map((blocked, index) => (
                    <div key={`${blocked.scope}-${index}`}>
                      {blocked.scope}: {blocked.timeslot_ids.join(", ")} (
                      {blocked.reason})
                    </div>
                  ))
                ) : (
                  <div>None</div>
                )}
              </div>
              <div>
                <div className="font-medium">Locked Assignments</div>
                {mockData.locked_assignments.length ? (
                  mockData.locked_assignments.map((lock) => (
                    <div key={lock.section_id}>
                      {lock.section_id}: times=
                      {lock.fixed_timeslot_set?.join(", ") ?? "—"}, room=
                      {lock.fixed_room ?? "—"}
                    </div>
                  ))
                ) : (
                  <div>None</div>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          color="primary"
          radius="full"
          onPress={runSolver}
          isLoading={status === "loading"}
        >
          Run Solver
        </Button>
        <span className="text-sm text-default-500">
          Server-side API call:{" "}
          <code className="text-default-700">POST /api/schedule</code>
        </span>
      </div>

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
                  {solution.assignments.map((assignment) => (
                    <tr
                      key={assignment.section_id}
                      className="border-t border-default-200"
                    >
                      <td className="py-2 pr-4 font-medium">
                        {assignment.section_id}
                      </td>
                      <td className="py-2 pr-4">
                        {assignment.meeting_pattern_id}
                      </td>
                      <td className="py-2 pr-4">
                        {assignment.timeslot_ids
                          .map((id) => timeslotLabelMap.get(id) ?? id)
                          .join(", ")}
                      </td>
                      <td className="py-2 pr-4">{assignment.room_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Score Breakdown</h3>
            </CardHeader>
            <CardBody className="text-sm space-y-1">
              <div>Total Score: {solution.total_score.toFixed(2)}</div>
              {Object.entries(solution.penalty_breakdown).map(
                ([key, value]) => (
                  <div key={key}>
                    {key.replace(/_/g, " ")}: {value.toFixed(2)}
                  </div>
                )
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Explanations</h3>
            </CardHeader>
            <CardBody className="space-y-2 text-sm text-default-600">
              {solution.explanations.map((explanation) => (
                <div key={explanation}>{explanation}</div>
              ))}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
};

"use client";

import { useMemo, useState } from "react";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";

import { mockSchedulingInput } from "@/lib/scheduling/mockData";
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

const buildTimeslotLabelMap = () => {
  const map = new Map<string, string>();
  mockSchedulingInput.timeslots.forEach((slot) => {
    map.set(slot.id, `${slot.day} ${slot.start_time}-${slot.end_time}`);
  });
  return map;
};

export const SchedulerDemo = () => {
  const [solution, setSolution] = useState<ScheduleSolution | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [diagnostics, setDiagnostics] = useState<ApiError["diagnostics"]>();
  const [status, setStatus] = useState<"idle" | "loading">("idle");

  const timeslotLabelMap = useMemo(buildTimeslotLabelMap, []);

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
            This demo uses fixed mock data and a deterministic solver.
          </p>
        </CardHeader>
        <CardBody className="grid gap-3 text-sm sm:grid-cols-2">
          <div>Sections: {mockSchedulingInput.sections.length}</div>
          <div>Rooms: {mockSchedulingInput.rooms.length}</div>
          <div>Instructors: {mockSchedulingInput.instructors.length}</div>
          <div>Timeslots: {mockSchedulingInput.timeslots.length}</div>
          <div>
            Meeting Patterns: {mockSchedulingInput.meeting_patterns.length}
          </div>
          <div>
            Constraints:{" "}
            {mockSchedulingInput.crosslist_groups.length +
              mockSchedulingInput.no_overlap_groups.length}
          </div>
        </CardBody>
      </Card>

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

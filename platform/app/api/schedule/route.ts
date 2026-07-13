import { NextRequest, NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import { verifyToken } from "@/lib/auth";
import { mockSchedulingInput } from "@/lib/scheduling/mockData";
import type { SchedulingInput } from "@/lib/scheduling/types";
import {
  acquireSolverLock,
  readSolverLock,
  releaseSolverLock,
} from "@/lib/solver-lock";
import { tryRecordActivity } from "@/lib/record-activity";
import { fetchSolver, solverErrorsFromBody } from "@/lib/api/solverFetch";
import { enrichSolverErrors, normalizeNetworkError } from "@/lib/spreadsheet/formatGuide";
import { publishSharedSchedule } from "@/lib/shared-schedule";

// The CP-SAT solver may take up to 120s; give extra headroom.
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  // Serialize solver runs across users: the Flask solver is single-worker
  // and CP-SAT is CPU/memory heavy — two concurrent runs have been observed
  // to fail with generic "fetch failed" (solver crash / timeout). Reject
  // overlapping requests with 409 so the client can present a clear message.
  let userLabel: string | null = null;
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    if (token) {
      const user = await verifyToken(token);
      userLabel = user?.name ?? user?.email ?? null;
    }
  } catch {
    // best-effort attribution
  }
  if (!acquireSolverLock(userLabel)) {
    const state = readSolverLock();
    return NextResponse.json(
      {
        status: "error",
        errors: [
          {
            code: "solver_busy",
            message: state.startedBy
              ? `The solver is currently running (started by ${state.startedBy}). Please wait for it to finish.`
              : "The solver is currently running. Please wait for it to finish.",
          },
        ],
      },
      { status: 409 },
    );
  }
  try {
    // Use request body if provided, otherwise fall back to mock data
    let input: SchedulingInput;
    let removeInstructors: string[] | undefined;
    try {
      const body = await request.json();
      input = body as SchedulingInput;
      removeInstructors = (body as Record<string, unknown>).remove_instructors as string[] | undefined;
      // Basic validation - check if it has the required fields
      if (!input.sections || !input.rooms || !input.timeslots) {
        input = mockSchedulingInput;
      }
    } catch {
      // If no body or invalid JSON, use mock data
      input = mockSchedulingInput;
    }

    const { response, data } = await fetchSolver(
      "/solve",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          ...(removeInstructors?.length ? { remove_instructors: removeInstructors } : {}),
        }),
      },
      { timeoutMs: 150_000 },
    );

    if (!response.ok) {
      const errors = enrichSolverErrors(
        solverErrorsFromBody(data, "solver_error", "Solver returned an error.") as Array<{
          code: string;
          message: string;
        }>,
      );
      return NextResponse.json(
        {
          status: "error",
          errors,
          diagnostics: data.diagnostics,
        },
        { status: 422 },
      );
    }

    if (data.status === "error") {
      const errors = enrichSolverErrors(
        solverErrorsFromBody(data, "infeasible", "No feasible schedule found.") as Array<{
          code: string;
          message: string;
        }>,
      );
      return NextResponse.json({
        status: "error",
        errors,
        diagnostics: data.diagnostics,
      });
    }

    await tryRecordActivity(request, "solver_run");

    // Publish the result as the shared "latest schedule" so other live users can
    // see it on their calendar. Skip hypothetical preview runs (e.g. the
    // "Test without these instructors" retry) so they don't overwrite everyone.
    let sharedRevision: number | undefined;
    if (!removeInstructors?.length) {
      try {
        const lockedSectionIds = Array.isArray(input.locked_assignments)
          ? Array.from(
              new Set(
                input.locked_assignments
                  .map((la) => (la as { section_id?: string }).section_id)
                  .filter((id): id is string => typeof id === "string"),
              ),
            )
          : [];
        const meta = publishSharedSchedule({
          ranBy: userLabel,
          snapshot: {
            input,
            solution: data,
            lockedSectionIds,
            createdAt: new Date().toISOString(),
          },
        });
        sharedRevision = meta.revision;
      } catch {
        // Publishing is best-effort; never fail the solve because of it.
      }
    }

    return NextResponse.json(
      sharedRevision !== undefined ? { ...data, shared_revision: sharedRevision } : data,
    );
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "AbortError";
    const rawMessage = isTimeout
      ? "Solver request timed out. Use Check Data in the editor to find row-level issues, or try again after relaxing constraints."
      : error instanceof Error
        ? error.message
        : "Failed to reach scheduling service.";
    const message = isTimeout ? rawMessage : normalizeNetworkError(rawMessage, "solver");
    return NextResponse.json(
      {
        status: "error",
        errors: enrichSolverErrors([
          { code: isTimeout ? "solver_timeout" : "network_error", message },
        ]),
      },
      { status: 502 },
    );
  } finally {
    releaseSolverLock();
  }
}

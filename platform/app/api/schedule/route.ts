import { NextRequest, NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import { verifyToken } from "@/lib/auth";
import { mockSchedulingInput } from "@/lib/scheduling/mockData";
import type { SchedulingInput } from "@/lib/scheduling/types";
import {
  beginSolverRun,
  finishSession,
  readSolverSession,
} from "@/lib/solver-session";
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
  let userNetworkId: string | null = null;
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    if (token) {
      const user = await verifyToken(token);
      userLabel = user?.name ?? user?.email ?? null;
      userNetworkId = user?.networkId ?? null;
    }
  } catch {
    // best-effort attribution
  }

  const started = beginSolverRun({
    startedBy: userLabel,
    startedByNetworkId: userNetworkId,
  });
  if (!started) {
    const state = readSolverSession();
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

  let finished = false;
  const finish = (opts: Parameters<typeof finishSession>[0]) => {
    if (finished) return;
    finished = true;
    finishSession(opts);
  };

  try {
    let input: SchedulingInput;
    let removeInstructors: string[] | undefined;
    try {
      const body = await request.json();
      input = body as SchedulingInput;
      removeInstructors = (body as Record<string, unknown>).remove_instructors as
        | string[]
        | undefined;
      if (!input.sections || !input.rooms || !input.timeslots) {
        input = mockSchedulingInput;
      }
    } catch {
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
      { timeoutMs: 150_000, signal: started.signal },
    );

    // If cancelled while waiting, do not publish or treat as success.
    if (started.signal.aborted) {
      finish({ status: "cancelled", progress: 0 });
      return NextResponse.json(
        {
          status: "error",
          errors: [{ code: "solver_cancelled", message: "Solver run was cancelled." }],
        },
        { status: 499 },
      );
    }

    if (!response.ok) {
      const errors = enrichSolverErrors(
        solverErrorsFromBody(data, "solver_error", "Solver returned an error.") as Array<{
          code: string;
          message: string;
        }>,
      );
      finish({
        status: "failed",
        error: errors[0]?.message ?? "Solver returned an error.",
      });
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
      finish({
        status: "failed",
        error: errors[0]?.message ?? "No feasible schedule found.",
      });
      return NextResponse.json({
        status: "error",
        errors,
        diagnostics: data.diagnostics,
      });
    }

    await tryRecordActivity(request, "solver_run");

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

    finish({ status: "completed", progress: 100 });

    return NextResponse.json(
      sharedRevision !== undefined ? { ...data, shared_revision: sharedRevision } : data,
    );
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === "AbortError";
    if (isAbort || started.signal.aborted) {
      // Cancel or max-runtime abort — finishSession may already have been called
      // by cancelSolverSession / max-runtime timer.
      const current = readSolverSession();
      if (current.locked) {
        finish({
          status: current.status === "cancelled" ? "cancelled" : "failed",
          error:
            current.status === "cancelled"
              ? null
              : "Solver request was aborted before completion.",
          progress: 0,
        });
      }
      return NextResponse.json(
        {
          status: "error",
          errors: [
            {
              code: "solver_cancelled",
              message: "Solver run was cancelled.",
            },
          ],
        },
        { status: 499 },
      );
    }

    const rawMessage =
      error instanceof Error ? error.message : "Failed to reach scheduling service.";
    const message = normalizeNetworkError(rawMessage, "solver");
    finish({ status: "failed", error: message });
    return NextResponse.json(
      {
        status: "error",
        errors: enrichSolverErrors([{ code: "network_error", message }]),
      },
      { status: 502 },
    );
  } finally {
    // Safety: never leave the session locked if we forgot to finish.
    const current = readSolverSession();
    if (current.locked && current.runId === started.runId) {
      finish({
        status: "failed",
        error: "Solver run ended unexpectedly.",
      });
    }
  }
}

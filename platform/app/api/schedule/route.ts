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

const SOLVER_URL = process.env.SOLVER_URL ?? "http://localhost:5001";
const SOLVER_FALLBACK_URLS = ["http://localhost:5001", "http://localhost:8000"];

// The CP-SAT solver may take up to 120s; give extra headroom.
export const maxDuration = 180;

const parseResponseBody = async (response: Response) => {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { raw };
  }
};

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

    const candidateUrls = [SOLVER_URL, ...SOLVER_FALLBACK_URLS].filter(
      (url, idx, arr) => arr.indexOf(url) === idx,
    );
    let response: Response | null = null;
    let data: Record<string, unknown> = {};
    let lastError: unknown = null;

    for (const baseUrl of candidateUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 150_000);
        response = await fetch(`${baseUrl}/solve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, ...(removeInstructors?.length ? { remove_instructors: removeInstructors } : {}) }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        data = await parseResponseBody(response);
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!response) {
      throw lastError ?? new Error("Failed to reach solver service.");
    }

    if (!response.ok) {
      const rawBody = typeof data.raw === "string" ? data.raw.slice(0, 240) : undefined;
      return NextResponse.json(
        {
          status: "error",
          errors: Array.isArray(data.errors) ? data.errors : [
            { code: "solver_error", message: "Solver returned an error." },
          ],
          diagnostics: data.diagnostics,
          ...(rawBody
            ? {
                errors: [
                  {
                    code: "solver_response_invalid",
                    message: `Solver returned non-JSON response. ${rawBody}`,
                  },
                ],
              }
            : {}),
        },
        { status: 422 }
      );
    }

    if (data.status === "error") {
      return NextResponse.json({
        status: "error",
        errors: Array.isArray(data.errors)
          ? data.errors
          : [{ code: "infeasible", message: "No feasible schedule found." }],
        diagnostics: data.diagnostics,
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach solver service.";
    return NextResponse.json(
      { status: "error", errors: [{ code: "network_error", message }] },
      { status: 502 }
    );
  } finally {
    releaseSolverLock();
  }
}

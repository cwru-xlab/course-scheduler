import { NextRequest, NextResponse } from "next/server";

import { fetchSolver } from "@/lib/api/solverFetch";
import { normalizeNetworkError } from "@/lib/spreadsheet/formatGuide";
import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = (body as { input?: SchedulingInput }).input ?? (body as SchedulingInput);

    const { response, data } = await fetchSolver(
      "/validate-scheduling-input",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      },
      { timeoutMs: 90_000 },
    );

    const issues = (Array.isArray(data.issues) ? data.issues : []) as ValidationError[];
    const issueCount =
      typeof data.issue_count === "number" ? data.issue_count : issues.length;

    if (!response.ok || data.status === "error" || issues.length > 0) {
      return NextResponse.json(
        {
          status: "error",
          issues,
          issue_count: issueCount,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      status: "ok",
      issues: [],
      issue_count: 0,
    });
  } catch (error) {
    const rawMessage =
      error instanceof DOMException && error.name === "AbortError"
        ? "Validation request timed out. The dataset may be too large — try importing a smaller file first."
        : error instanceof Error
          ? error.message
          : "Failed to reach scheduling service.";
    const message = normalizeNetworkError(rawMessage, "solver");
    return NextResponse.json(
      {
        status: "error",
        issues: [{ code: "network_error", message }],
        issue_count: 1,
      },
      { status: 502 },
    );
  }
}

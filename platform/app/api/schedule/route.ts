import { NextRequest, NextResponse } from "next/server";

import { mockSchedulingInput } from "@/lib/scheduling/mockData";
import type { SchedulingInput } from "@/lib/scheduling/types";

const SOLVER_URL = process.env.SOLVER_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    // Use request body if provided, otherwise fall back to mock data
    let input: SchedulingInput;
    try {
      const body = await request.json();
      input = body as SchedulingInput;
      // Basic validation - check if it has the required fields
      if (!input.sections || !input.rooms || !input.timeslots) {
        input = mockSchedulingInput;
      }
    } catch {
      // If no body or invalid JSON, use mock data
      input = mockSchedulingInput;
    }

    const response = await fetch(`${SOLVER_URL}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });

    const data = await response.json();

    if (!response.ok || data.status === "error") {
      return NextResponse.json(
        {
          status: "error",
          errors: data.errors ?? [
            { code: "solver_error", message: "Solver returned an error." },
          ],
          diagnostics: data.diagnostics,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach solver service.";
    return NextResponse.json(
      { status: "error", errors: [{ code: "network_error", message }] },
      { status: 502 }
    );
  }
}

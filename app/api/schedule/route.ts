import { NextResponse } from "next/server";

import { mockSchedulingInput } from "@/lib/scheduling/mockData";
import { runMockSolver } from "@/lib/scheduling/mockSolver";

export async function POST() {
  const result = runMockSolver(mockSchedulingInput);

  if (!result.ok) {
    return NextResponse.json(
      {
        status: "error",
        errors: result.errors,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    status: "ok",
    ...result.solution,
  });
}

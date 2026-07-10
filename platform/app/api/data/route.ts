import { NextResponse } from "next/server";

import { getSchedulingDataRevision } from "@/lib/scheduling/dataRevisionStore";

const SOLVER_URL = process.env.SOLVER_URL ?? "http://localhost:5001";

export async function GET() {
  try {
    const response = await fetch(`${SOLVER_URL}/data`, {
      method: "GET",
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok || data.status === "error") {
      return NextResponse.json(
        {
          status: "error",
          errors:
            data.errors ??
            [{ code: "read_failed", message: "Backend failed to read data." }],
        },
        { status: response.status || 500 },
      );
    }

    return NextResponse.json(
      {
        ...data,
        meta: {
          revision: getSchedulingDataRevision(),
        },
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach solver service.";
    return NextResponse.json(
      { status: "error", errors: [{ code: "network_error", message }] },
      { status: 502 },
    );
  }
}


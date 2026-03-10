import { NextRequest, NextResponse } from "next/server";

import type { Section } from "@/lib/scheduling/types";

const SOLVER_URL = process.env.SOLVER_URL ?? "http://localhost:8000";

type UpdateSectionsBody = {
  sections: Section[];
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<UpdateSectionsBody> | null;

    if (!body || !Array.isArray(body.sections)) {
      return NextResponse.json(
        {
          status: "error",
          errors: [
            {
              code: "invalid_request",
              message: "Request body must include a 'sections' array.",
            },
          ],
        },
        { status: 400 },
      );
    }

    const response = await fetch(`${SOLVER_URL}/update-sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections: body.sections }),
    });

    const data = await response.json();

    if (!response.ok || data.status === "error") {
      return NextResponse.json(
        {
          status: "error",
          errors:
            data.errors ??
            [
              {
                code: "update_failed",
                message: "Backend failed to update sections.",
              },
            ],
        },
        { status: response.status || 500 },
      );
    }

    return NextResponse.json(
      {
        status: "ok",
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach solver service.";
    return NextResponse.json(
      {
        status: "error",
        errors: [{ code: "network_error", message }],
      },
      { status: 502 },
    );
  }
}


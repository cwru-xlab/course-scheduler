import { NextRequest, NextResponse } from "next/server";

import type { NotesRowEntry } from "@/lib/notes/types";

const SOLVER_URL = process.env.SOLVER_URL ?? "http://localhost:5001";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      input?: unknown;
      notes?: NotesRowEntry[];
    };
    const response = await fetch(`${SOLVER_URL}/export-scheduling-spreadsheet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: body.input ?? body,
        notes: Array.isArray(body.notes) ? body.notes : [],
      }),
    });

    if (!response.ok) {
      let solverError = "Backend failed to export spreadsheet.";
      try {
        const errorPayload = (await response.json()) as {
          errors?: Array<{ message?: string }>;
        };
        solverError = errorPayload.errors?.[0]?.message ?? solverError;
      } catch {
        // Keep default message if backend did not return JSON.
      }
      return NextResponse.json(
        {
          status: "error",
          errors: [{ code: "export_failed", message: solverError }],
        },
        { status: response.status || 500 },
      );
    }

    const solverBytes = await response.arrayBuffer();

    return new NextResponse(solverBytes, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          response.headers.get("content-disposition") ??
          "attachment; filename=scheduling_export.xlsx",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach solver service.";
    return NextResponse.json(
      {
        status: "error",
        errors: [{ code: "network_error", message }],
      },
      { status: 502 },
    );
  }
}

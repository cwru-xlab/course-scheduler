import { NextRequest, NextResponse } from "next/server";

import { fetchSolver, solverErrorsFromBody } from "@/lib/api/solverFetch";
import {
  enrichSpreadsheetErrors,
  normalizeNetworkError,
} from "@/lib/spreadsheet/formatGuide";
import type { NotesRowEntry } from "@/lib/notes/types";
import type { ValidationError } from "@/lib/scheduling/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      input?: unknown;
      notes?: NotesRowEntry[];
    };

    const { response } = await fetchSolver("/export-scheduling-spreadsheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: body.input ?? body,
        notes: Array.isArray(body.notes) ? body.notes : [],
      }),
    });

    if (!response.ok) {
      let errors: ValidationError[] = [
        { code: "export_failed", message: "Backend failed to export spreadsheet." },
      ];
      try {
        const errorPayload = (await response.json()) as {
          errors?: ValidationError[];
          status?: string;
        };
        errors = solverErrorsFromBody(
          errorPayload,
          "export_failed",
          "Backend failed to export spreadsheet.",
        ) as ValidationError[];
      } catch {
        // Non-JSON error body — keep default message.
      }

      return NextResponse.json(
        {
          status: "error",
          errors: enrichSpreadsheetErrors(errors, "export"),
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
    const message = normalizeNetworkError(
      error instanceof Error ? error.message : "Failed to reach scheduling service.",
      "export",
    );
    return NextResponse.json(
      {
        status: "error",
        errors: enrichSpreadsheetErrors([{ code: "network_error", message }], "export"),
      },
      { status: 502 },
    );
  }
}

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

    const { response, data } = await fetchSolver(
      "/export-scheduling-spreadsheet",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: body.input ?? body,
          notes: Array.isArray(body.notes) ? body.notes : [],
        }),
      },
      // Spreadsheet bytes must not be consumed by JSON parsing.
      { parseBody: "none" },
    );

    if (!response.ok) {
      // Error bodies are still JSON-parsed by fetchSolver; use that payload
      // instead of trying to re-read response.json() (body already consumed).
      const errors = solverErrorsFromBody(
        data,
        "export_failed",
        "Backend failed to export spreadsheet.",
      ) as ValidationError[];

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

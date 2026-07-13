import { NextRequest, NextResponse } from "next/server";

import { verifyToken } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { fetchSolver, solverErrorsFromBody } from "@/lib/api/solverFetch";
import { parseNotesFromWorkbook } from "@/lib/spreadsheet-notes";
import { tryRecordActivity } from "@/lib/record-activity";
import { tryRecordSchedulingDataRevision } from "@/lib/scheduling/dataRevisionStore";
import {
  enrichSpreadsheetErrors,
  formatErrorsSummary,
  normalizeNetworkError,
} from "@/lib/spreadsheet/formatGuide";
import type { NotesRowPatch } from "@/lib/notes/types";
import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";

type ImportSpreadsheetSuccess = {
  status: "ok";
  scheduling_input: SchedulingInput;
  notes_patches: NotesRowPatch[];
  notes_import_summary: {
    rowsUpdated: number;
    notesAdded: number;
    notesFromSheet: number;
    repliesFromSheet: number;
    notesRemoved: number;
  };
};

export async function POST(request: NextRequest) {
  try {
    const incoming = await request.formData();
    const file = incoming.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          status: "error",
          errors: enrichSpreadsheetErrors(
            [{ code: "missing_file", message: "Upload an Excel file in form field 'file'." }],
            "import",
          ),
        },
        { status: 400 },
      );
    }

    const fileBytes = await file.arrayBuffer();

    const formData = new FormData();
    formData.set("file", file, file.name);

    const { response, data } = await fetchSolver("/import-scheduling-spreadsheet", {
      method: "POST",
      body: formData,
    });

    if (!response.ok || data.status === "error") {
      const backendErrors = solverErrorsFromBody(
        data,
        "import_failed",
        "Backend failed to import spreadsheet.",
      ) as ValidationError[];

      return NextResponse.json(
        {
          status: "error",
          errors: enrichSpreadsheetErrors(backendErrors, "import"),
        },
        { status: response.status || 500 },
      );
    }

    const schedulingInput = (data as { scheduling_input?: SchedulingInput }).scheduling_input;
    if (!schedulingInput) {
      return NextResponse.json(
        {
          status: "error",
          errors: enrichSpreadsheetErrors(
            [
              {
                code: "import_failed",
                message: "Import succeeded but scheduling data was missing from the service response.",
              },
            ],
            "import",
          ),
        },
        { status: 502 },
      );
    }

    let notesResult;
    try {
      const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
      const user = token ? await verifyToken(token) : null;
      notesResult = parseNotesFromWorkbook(fileBytes, user);
    } catch (notesError) {
      const detail =
        notesError instanceof Error
          ? notesError.message
          : "Notes sheet could not be parsed.";
      return NextResponse.json(
        {
          status: "error",
          errors: enrichSpreadsheetErrors(
            [
              {
                code: "notes_parse_failed",
                message:
                  "The scheduling data imported, but the Notes sheet could not be read. Check the Notes sheet format in the example spreadsheet.",
                detail,
              },
            ],
            "import",
          ),
        },
        { status: 422 },
      );
    }

    await tryRecordActivity(request, "spreadsheet_import");
    await tryRecordSchedulingDataRevision(request);

    const payload: ImportSpreadsheetSuccess = {
      status: "ok",
      scheduling_input: schedulingInput,
      notes_patches: notesResult.patches,
      notes_import_summary: notesResult.summary,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const message = normalizeNetworkError(
      error instanceof Error ? error.message : "Failed to reach scheduling service.",
      "import",
    );
    return NextResponse.json(
      {
        status: "error",
        errors: enrichSpreadsheetErrors([{ code: "network_error", message }], "import"),
        summary: formatErrorsSummary([{ code: "network_error", message }], "import"),
      },
      { status: 502 },
    );
  }
}

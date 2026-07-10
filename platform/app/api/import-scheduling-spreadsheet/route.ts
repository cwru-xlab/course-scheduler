import { NextRequest, NextResponse } from "next/server";

import { verifyToken } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { parseNotesFromWorkbook } from "@/lib/spreadsheet-notes";
import { tryRecordActivity } from "@/lib/record-activity";
import { tryRecordSchedulingDataRevision } from "@/lib/scheduling-data-revision";
import type { NotesRowPatch } from "@/lib/notes/types";
import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";

const SOLVER_URL = process.env.SOLVER_URL ?? "http://localhost:5001";

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

type ImportSpreadsheetError = {
  status: "error";
  errors?: ValidationError[];
};

export async function POST(request: NextRequest) {
  try {
    const incoming = await request.formData();
    const file = incoming.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          status: "error",
          errors: [{ code: "missing_file", message: "Upload an Excel file in form field 'file'." }],
        },
        { status: 400 },
      );
    }

    const fileBytes = await file.arrayBuffer();

    const formData = new FormData();
    formData.set("file", file, file.name);

    const response = await fetch(`${SOLVER_URL}/import-scheduling-spreadsheet`, {
      method: "POST",
      body: formData,
    });

    const data = (await response.json()) as ImportSpreadsheetSuccess | ImportSpreadsheetError;
    if (!response.ok || data.status === "error") {
      const backendErrors =
        data.status === "error" && Array.isArray(data.errors) ? data.errors : [];
      return NextResponse.json(
        {
          status: "error",
          errors:
            backendErrors.length > 0
              ? backendErrors
              : [{ code: "import_failed", message: "Backend failed to import spreadsheet." }],
        },
        { status: response.status || 500 },
      );
    }

    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    const user = token ? await verifyToken(token) : null;
    const notesResult = parseNotesFromWorkbook(fileBytes, user);

    await tryRecordActivity(request, "spreadsheet_import");
    await tryRecordSchedulingDataRevision(request);

    return NextResponse.json(
      {
        status: "ok",
        scheduling_input: data.scheduling_input,
        notes_patches: notesResult.patches,
        notes_import_summary: notesResult.summary,
      },
      { status: 200 },
    );
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

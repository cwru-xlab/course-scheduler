import { NextRequest, NextResponse } from "next/server";

import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";

const SOLVER_URL = process.env.SOLVER_URL ?? "http://localhost:5001";

type ImportSpreadsheetSuccess = {
  status: "ok";
  scheduling_input: SchedulingInput;
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
        { status: 400 }
      );
    }

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
        { status: response.status || 500 }
      );
    }

    return NextResponse.json(
      {
        status: "ok",
        scheduling_input: data.scheduling_input,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach solver service.";
    return NextResponse.json(
      {
        status: "error",
        errors: [{ code: "network_error", message }],
      },
      { status: 502 }
    );
  }
}

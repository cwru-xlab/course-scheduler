import { NextRequest, NextResponse } from "next/server";

const SOLVER_URL = process.env.SOLVER_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await fetch(`${SOLVER_URL}/export-scheduling-spreadsheet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
        { status: response.status || 500 }
      );
    }

    const contentType =
      response.headers.get("content-type") ??
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const contentDisposition =
      response.headers.get("content-disposition") ??
      "attachment; filename=scheduling_export.xlsx";
    const bytes = await response.arrayBuffer();

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
      },
    });
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

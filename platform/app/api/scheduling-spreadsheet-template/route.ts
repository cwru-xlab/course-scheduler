import { NextResponse } from "next/server";

const SOLVER_URL = process.env.SOLVER_URL ?? "http://localhost:8000";

export async function GET() {
  try {
    const response = await fetch(`${SOLVER_URL}/scheduling-spreadsheet-template`, {
      method: "GET",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          status: "error",
          errors: [{ code: "template_failed", message: "Backend failed to generate template." }],
        },
        { status: response.status || 500 }
      );
    }

    const bytes = await response.arrayBuffer();
    const contentType =
      response.headers.get("content-type") ??
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const contentDisposition =
      response.headers.get("content-disposition") ??
      "attachment; filename=scheduling_template.xlsx";

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

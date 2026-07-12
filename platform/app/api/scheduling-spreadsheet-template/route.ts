import { readFile } from "fs/promises";
import { join } from "path";

import { NextResponse } from "next/server";

import { normalizeNetworkError, EXAMPLE_SPREADSHEET_FILENAME } from "@/lib/spreadsheet/formatGuide";

const EXAMPLE_FILE = join(process.cwd(), "public", EXAMPLE_SPREADSHEET_FILENAME);

/** Serves the canonical example spreadsheet format from /public. */
export async function GET() {
  try {
    const bytes = await readFile(EXAMPLE_FILE);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=${EXAMPLE_SPREADSHEET_FILENAME}`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const message = normalizeNetworkError(
      error instanceof Error ? error.message : "Example spreadsheet is unavailable.",
      "export",
    );
    return NextResponse.json(
      {
        status: "error",
        errors: [{ code: "template_failed", message }],
      },
      { status: 500 },
    );
  }
}

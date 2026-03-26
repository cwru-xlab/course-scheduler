import { NextRequest, NextResponse } from "next/server";

import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";

const SOLVER_URL = process.env.SOLVER_URL ?? "http://localhost:5001";
const SOLVER_FALLBACK_URLS = ["http://localhost:5001", "http://localhost:8000"];

const parseResponseBody = async (response: Response) => {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { raw };
  }
};

type UpdateSchedulingBody = Partial<SchedulingInput>;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UpdateSchedulingBody | null;

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

    const candidateUrls = [SOLVER_URL, ...SOLVER_FALLBACK_URLS].filter(
      (url, idx, arr) => arr.indexOf(url) === idx,
    );

    let lastError: unknown = null;

    for (const baseUrl of candidateUrls) {
      try {
        const response = await fetch(`${baseUrl}/update-sections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        // If this solver instance doesn't implement the endpoint yet, try next.
        if (response.status === 404 || response.status === 405) continue;

        const data = await parseResponseBody(response);
        const parsedStatus = (data as Record<string, unknown>).status;

        if (!response.ok || parsedStatus === "error") {
          const backendErrors = Array.isArray((data as any)?.errors)
            ? ((data as any).errors as ValidationError[])
            : [];

          return NextResponse.json(
            {
              status: "error",
              errors:
                backendErrors.length > 0
                  ? backendErrors
                  : [
                      {
                        code: "update_failed",
                        message: "Backend failed to update sections.",
                      },
                    ],
            },
            { status: response.status || 500 },
          );
        }

        return NextResponse.json({ status: "ok" }, { status: 200 });
      } catch (err) {
        lastError = err;
      }
    }

    const message =
      lastError instanceof Error
        ? lastError.message
        : "Failed to reach solver service.";
    return NextResponse.json(
      {
        status: "error",
        errors: [{ code: "network_error", message }],
      },
      { status: 502 },
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


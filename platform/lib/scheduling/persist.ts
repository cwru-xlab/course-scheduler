import { normalizeCrosslistData } from "@/lib/scheduling/crosslist";
import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";

export type PersistSchedulingResult =
  | { ok: true; warnings: string[] }
  | { ok: false; message: string; errors: ValidationError[] };

/** Write full scheduling input to the solver database (sections, states, constraints, etc.). */
export async function persistSchedulingInput(
  input: SchedulingInput,
): Promise<PersistSchedulingResult> {
  const normalized = normalizeCrosslistData(input);

  const response = await fetch("/api/update-all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalized),
  });

  const payload = (await response.json()) as
    | { status: "ok"; warnings?: string[] }
    | { status: "error"; errors?: ValidationError[] };

  if (!response.ok || payload.status === "error") {
    const errors =
      payload.status === "error" && Array.isArray(payload.errors) ? payload.errors : [];
    const message =
      errors[0]?.message ?? "Failed to save imported data to the server.";
    return { ok: false, message, errors };
  }

  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
  return { ok: true, warnings };
}

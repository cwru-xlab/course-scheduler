import {
  applyNotesImportOverwriteToLocalStorage,
  formatNotesImportSummaryMessage,
} from "@/lib/notes/storage";
import type { NotesRowPatch } from "@/lib/notes/types";
import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";
import {
  enrichSpreadsheetErrors,
  formatErrorsDetail,
  formatErrorsSummary,
  isFetchFailedMessage,
  normalizeNetworkError,
} from "@/lib/spreadsheet/formatGuide";

export type ImportSpreadsheetResponse =
  | {
      status: "ok";
      scheduling_input: SchedulingInput;
      notes_patches?: NotesRowPatch[];
      notes_import_summary?: {
        rowsUpdated: number;
        notesAdded: number;
        notesFromSheet: number;
        repliesFromSheet: number;
        notesRemoved?: number;
      };
    }
  | { status: "error"; errors: ValidationError[] };

export async function importSpreadsheetFile(
  file: File,
  options?: { successPrefix?: string },
): Promise<{
  ok: true;
  scheduling_input: SchedulingInput;
  message: string;
} | {
  ok: false;
  errors: ValidationError[];
  message: string;
  detail: string;
}> {
  const formData = new FormData();
  formData.set("file", file, file.name);

  let response: Response;
  try {
    response = await fetch("/api/import-scheduling-spreadsheet", {
      method: "POST",
      body: formData,
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Failed to import spreadsheet.";
    const message = normalizeNetworkError(
      isFetchFailedMessage(raw) ? "fetch failed" : raw,
      "import",
    );
    const errors = enrichSpreadsheetErrors([{ code: "network_error", message }], "import");
    return {
      ok: false,
      errors,
      message: formatErrorsSummary(errors, "import"),
      detail: formatErrorsDetail(errors, "import"),
    };
  }

  let result: ImportSpreadsheetResponse;
  try {
    result = (await response.json()) as ImportSpreadsheetResponse;
  } catch {
    const errors = enrichSpreadsheetErrors(
      [
        {
          code: "solver_response_invalid",
          message:
            "The import service returned an unexpected response. Confirm the scheduling service is running and try again.",
          detail: `HTTP status ${response.status}`,
        },
      ],
      "import",
    );
    return {
      ok: false,
      errors,
      message: formatErrorsSummary(errors, "import"),
      detail: formatErrorsDetail(errors, "import"),
    };
  }

  if (!response.ok || result.status === "error") {
    const importErrors =
      result.status === "error" && Array.isArray(result.errors) ? result.errors : [];
    const errors = enrichSpreadsheetErrors(
      importErrors.length > 0
        ? importErrors
        : [{ code: "import_failed", message: "Failed to import spreadsheet." }],
      "import",
    );
    return {
      ok: false,
      errors,
      message: formatErrorsSummary(errors, "import"),
      detail: formatErrorsDetail(errors, "import"),
    };
  }

  const summary = applyNotesImportOverwriteToLocalStorage(result.notes_patches ?? []);
  const notesMessage = formatNotesImportSummaryMessage(summary);

  return {
    ok: true,
    scheduling_input: result.scheduling_input,
    message: `${options?.successPrefix ?? "Spreadsheet imported."}${notesMessage}`,
  };
}

import {
  applyNotesImportOverwriteToLocalStorage,
  formatNotesImportSummaryMessage,
} from "@/lib/notes/storage";
import type { NotesRowPatch } from "@/lib/notes/types";
import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";

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
}> {
  const formData = new FormData();
  formData.set("file", file, file.name);

  const response = await fetch("/api/import-scheduling-spreadsheet", {
    method: "POST",
    body: formData,
  });
  const result = (await response.json()) as ImportSpreadsheetResponse;

  if (!response.ok || result.status === "error") {
    const importErrors =
      result.status === "error" && Array.isArray(result.errors) ? result.errors : [];
    const message = importErrors[0]?.message ?? "Failed to import spreadsheet.";
    return { ok: false, errors: importErrors, message };
  }

  const summary = applyNotesImportOverwriteToLocalStorage(result.notes_patches ?? []);
  const notesMessage = formatNotesImportSummaryMessage(summary);

  return {
    ok: true,
    scheduling_input: result.scheduling_input,
    message: `${options?.successPrefix ?? "Spreadsheet imported."}${notesMessage}`,
  };
}

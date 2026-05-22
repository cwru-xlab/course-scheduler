"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "@heroui/button";

import { applyNotesImportToLocalStorage, collectAllRowNotes } from "@/lib/notes/storage";
import type { NotesRowPatch } from "@/lib/notes/types";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";
import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";

type ImportSpreadsheetResponse =
  | {
      status: "ok";
      scheduling_input: SchedulingInput;
      notes_patches?: NotesRowPatch[];
      notes_import_summary?: {
        rowsUpdated: number;
        notesAdded: number;
        notesFromSheet: number;
        repliesFromSheet: number;
      };
    }
  | { status: "error"; errors: ValidationError[] };

const secondaryClassName =
  "bg-slate-100 dark:bg-default-100 text-slate-700 dark:text-foreground font-bold border border-slate-200 dark:border-default-200";

type Props = {
  data: SchedulingInput;
};

export function SpreadsheetImportExportButtons({ data }: Props) {
  const { updateData } = useSchedulingData();
  const [spreadsheetStatus, setSpreadsheetStatus] = useState<
    "idle" | "importing" | "import-success" | "import-error" | "exporting" | "export-error"
  >("idle");
  const [spreadsheetMessage, setSpreadsheetMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportButtonPress = () => {
    fileInputRef.current?.click();
  };

  const handleSpreadsheetFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.set("file", file, file.name);

    setSpreadsheetStatus("importing");
    setSpreadsheetMessage("");

    try {
      const response = await fetch("/api/import-scheduling-spreadsheet", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as ImportSpreadsheetResponse;

      if (!response.ok || result.status === "error") {
        const importErrors =
          result.status === "error" && Array.isArray(result.errors) ? result.errors : [];
        const message = importErrors[0]?.message ?? "Failed to import spreadsheet.";
        setSpreadsheetStatus("import-error");
        setSpreadsheetMessage(message);
        return;
      }

      updateData(result.scheduling_input);

      let notesMessage = "";
      if (result.notes_patches && result.notes_patches.length > 0) {
        const summary = applyNotesImportToLocalStorage(result.notes_patches);
        const parts: string[] = [];
        if (summary.notesAdded > 0) {
          parts.push(`${summary.notesAdded} new note${summary.notesAdded === 1 ? "" : "s"}`);
        }
        if (summary.notesFromSheet > 0) {
          parts.push(
            `${summary.notesFromSheet} from Notes sheet (${summary.repliesFromSheet} repl${summary.repliesFromSheet === 1 ? "y" : "ies"})`,
          );
        }
        if (parts.length > 0) {
          notesMessage = ` Notes: ${parts.join("; ")}.`;
        }
      }

      setSpreadsheetStatus("import-success");
      setSpreadsheetMessage(`Spreadsheet loaded into the editor.${notesMessage}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import spreadsheet.";
      setSpreadsheetStatus("import-error");
      setSpreadsheetMessage(message);
    } finally {
      event.target.value = "";
      setTimeout(() => setSpreadsheetStatus("idle"), 3000);
    }
  };

  const exportSpreadsheet = async () => {
    setSpreadsheetStatus("exporting");
    setSpreadsheetMessage("");
    try {
      const response = await fetch("/api/export-scheduling-spreadsheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: data, notes: collectAllRowNotes() }),
      });
      if (!response.ok) {
        let message = "Failed to export spreadsheet.";
        try {
          const payload = (await response.json()) as { errors?: ValidationError[] };
          message = payload.errors?.[0]?.message ?? message;
        } catch {
          // Keep fallback message.
        }
        setSpreadsheetStatus("export-error");
        setSpreadsheetMessage(message);
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] ?? "scheduling_export.xlsx";
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setSpreadsheetStatus("idle");
      setSpreadsheetMessage("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to export spreadsheet.";
      setSpreadsheetStatus("export-error");
      setSpreadsheetMessage(message);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xlsm,.xls"
        className="hidden"
        onChange={(e) => {
          void handleSpreadsheetFileSelected(e);
        }}
      />
      <Button
        className={secondaryClassName}
        onPress={handleImportButtonPress}
        isLoading={spreadsheetStatus === "importing"}
      >
        Import Spreadsheet
      </Button>
      <Button
        className={secondaryClassName}
        onPress={exportSpreadsheet}
        isLoading={spreadsheetStatus === "exporting"}
      >
        Export Spreadsheet
      </Button>
      {spreadsheetStatus === "import-success" && (
        <span className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
          {spreadsheetMessage}
        </span>
      )}
      {(spreadsheetStatus === "import-error" || spreadsheetStatus === "export-error") && (
        <span className="text-sm text-red-600 dark:text-red-400 font-semibold">
          {spreadsheetMessage}
        </span>
      )}
    </>
  );
}

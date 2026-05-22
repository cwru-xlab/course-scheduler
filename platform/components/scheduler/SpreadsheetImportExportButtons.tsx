"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "@heroui/button";

import { ImportSpreadsheetWarningModal } from "@/components/scheduler/ImportSpreadsheetWarningModal";
import { collectRowNotesForExport } from "@/lib/notes/storage";
import { importSpreadsheetFile } from "@/lib/spreadsheet-import-client";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";
import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";

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
  const [importWarningOpen, setImportWarningOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportButtonPress = () => {
    setImportWarningOpen(true);
  };

  const handleImportWarningConfirm = () => {
    setImportWarningOpen(false);
    fileInputRef.current?.click();
  };

  const handleSpreadsheetFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSpreadsheetStatus("importing");
    setSpreadsheetMessage("");

    try {
      const result = await importSpreadsheetFile(file, {
        successPrefix: "Spreadsheet loaded into the editor.",
      });
      if (!result.ok) {
        setSpreadsheetStatus("import-error");
        setSpreadsheetMessage(result.message);
        return;
      }

      updateData(result.scheduling_input);
      setSpreadsheetStatus("import-success");
      setSpreadsheetMessage(result.message);
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
        body: JSON.stringify({ input: data, notes: collectRowNotesForExport() }),
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
      <ImportSpreadsheetWarningModal
        isOpen={importWarningOpen}
        onCancel={() => setImportWarningOpen(false)}
        onConfirm={handleImportWarningConfirm}
      />
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

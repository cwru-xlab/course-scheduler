"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "@heroui/button";
import { FileDown, FileUp } from "lucide-react";

import { ImportSpreadsheetWarningModal } from "@/components/scheduler/ImportSpreadsheetWarningModal";
import {
  editorToolbarBtnSecondary,
} from "@/components/scheduler/editors/editorToolbarStyles";
import { collectRowNotesForExport } from "@/lib/notes/storage";
import { importSpreadsheetFile } from "@/lib/spreadsheet-import-client";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";
import type { SchedulingInput, ValidationError } from "@/lib/scheduling/types";

type Props = {
  data: SchedulingInput;
  onFeedbackChange?: (feedback: SpreadsheetFeedback | null) => void;
};

export type SpreadsheetFeedback = {
  type: "success" | "error";
  message: string;
};

export function SpreadsheetImportExportButtons({ data, onFeedbackChange }: Props) {
  const { updateData } = useSchedulingData();
  const [spreadsheetStatus, setSpreadsheetStatus] = useState<
    "idle" | "importing" | "import-success" | "import-error" | "exporting" | "export-error"
  >("idle");
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
    onFeedbackChange?.(null);

    try {
      const result = await importSpreadsheetFile(file, {
        successPrefix: "Spreadsheet loaded into the editor.",
      });
      if (!result.ok) {
        setSpreadsheetStatus("import-error");
        onFeedbackChange?.({ type: "error", message: result.message });
        return;
      }

      updateData(result.scheduling_input);
      setSpreadsheetStatus("import-success");
      onFeedbackChange?.({ type: "success", message: result.message });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import spreadsheet.";
      setSpreadsheetStatus("import-error");
      onFeedbackChange?.({ type: "error", message });
    } finally {
      event.target.value = "";
      setTimeout(() => {
        setSpreadsheetStatus("idle");
        onFeedbackChange?.(null);
      }, 3000);
    }
  };

  const exportSpreadsheet = async () => {
    setSpreadsheetStatus("exporting");
    onFeedbackChange?.(null);
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
        onFeedbackChange?.({ type: "error", message });
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
      onFeedbackChange?.(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to export spreadsheet.";
      setSpreadsheetStatus("export-error");
      onFeedbackChange?.({ type: "error", message });
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
        size="sm"
        radius="md"
        className={editorToolbarBtnSecondary}
        startContent={<FileUp className="size-3.5" aria-hidden />}
        onPress={handleImportButtonPress}
        isLoading={spreadsheetStatus === "importing"}
      >
        Import
      </Button>
      <Button
        size="sm"
        radius="md"
        className={editorToolbarBtnSecondary}
        startContent={<FileDown className="size-3.5" aria-hidden />}
        onPress={exportSpreadsheet}
        isLoading={spreadsheetStatus === "exporting"}
      >
        Export
      </Button>
    </>
  );
}

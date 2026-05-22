"use client";

import { createPortal } from "react-dom";
import { Button } from "@heroui/button";

const MODAL_Z = 1100;

type Props = {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ImportSpreadsheetWarningModal({ isOpen, onCancel, onConfirm }: Props) {
  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
      style={{ zIndex: MODAL_Z }}
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-default-200 dark:bg-content1"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="import-spreadsheet-warning-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4 dark:border-default-200">
          <h4
            id="import-spreadsheet-warning-title"
            className="text-base font-black text-slate-900 dark:text-foreground"
          >
            Import spreadsheet?
          </h4>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm text-slate-700 dark:text-default-600">
          <p>
            Importing will load scheduling data from the file and{" "}
            <strong className="font-semibold text-slate-900 dark:text-foreground">
              replace all notes
            </strong>{" "}
            in the app with what is in the spreadsheet.
          </p>
          <p>
            Any notes on the Notes feed (or in row note modals) that are{" "}
            <strong className="font-semibold text-slate-900 dark:text-foreground">
              not in the import file
            </strong>{" "}
            will be removed.
          </p>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            If you want to keep your current notes, use{" "}
            <strong className="font-semibold">Export Spreadsheet</strong> first, then import
            that file after editing.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-default-200">
          <Button size="sm" variant="light" onPress={onCancel}>
            Cancel
          </Button>
          <Button size="sm" color="warning" variant="flat" onPress={onConfirm}>
            Choose file to import
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

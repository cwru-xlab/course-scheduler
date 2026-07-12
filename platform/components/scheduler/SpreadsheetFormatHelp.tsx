"use client";

import {
  EXAMPLE_SPREADSHEET_FILENAME,
  EXAMPLE_SPREADSHEET_PATH,
  FORMAT_RULES_SUMMARY,
  REQUIRED_SHEETS,
} from "@/lib/spreadsheet/formatGuide";

type SpreadsheetFormatHelpProps = {
  compact?: boolean;
  className?: string;
};

export function SpreadsheetFormatHelp({ compact = false, className = "" }: SpreadsheetFormatHelpProps) {
  if (compact) {
    return (
      <p className={`text-xs leading-relaxed text-slate-600 ${className}`}>
        Download{" "}
        <a
          href={EXAMPLE_SPREADSHEET_PATH}
          download={EXAMPLE_SPREADSHEET_FILENAME}
          className="font-semibold text-weatherhead-primary hover:underline"
        >
          {EXAMPLE_SPREADSHEET_FILENAME}
        </a>{" "}
        and match its sheet names and column headers. {FORMAT_RULES_SUMMARY}
      </p>
    );
  }

  return (
    <div
      className={`rounded-lg border border-sky-200/80 bg-sky-50/60 px-3.5 py-3 text-sm text-slate-700 ${className}`}
    >
      <p className="font-semibold text-slate-900">Spreadsheet format reference</p>
      <p className="mt-1 leading-relaxed">
        Row content can differ from the example, but structure must stay consistent or import,
        export, and the solver may fail.
      </p>
      <a
        href={EXAMPLE_SPREADSHEET_PATH}
        download={EXAMPLE_SPREADSHEET_FILENAME}
        className="mt-2 inline-flex items-center text-sm font-semibold text-weatherhead-primary hover:underline"
      >
        Download {EXAMPLE_SPREADSHEET_FILENAME}
      </a>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{FORMAT_RULES_SUMMARY}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Required sheets: {REQUIRED_SHEETS.join(", ")}
      </p>
    </div>
  );
}

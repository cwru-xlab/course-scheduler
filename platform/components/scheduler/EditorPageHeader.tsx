"use client";

import { useState } from "react";
import { Button } from "@heroui/button";
import { CloudUpload } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { SpreadsheetFormatHelp } from "@/components/scheduler/SpreadsheetFormatHelp";
import { ValidationIssuesTable } from "@/components/scheduler/ValidationIssuesTable";
import { humanizeError } from "@/lib/errors/humanizeError";
import { SpreadsheetFormatHelp } from "@/components/scheduler/SpreadsheetFormatHelp";
import { ValidationIssuesTable } from "@/components/scheduler/ValidationIssuesTable";
import { hasLocatedIssues } from "@/lib/spreadsheet/validateClient";
import { EditorPageTitleDropdown } from "./EditorPageTitleDropdown";
import {
  SpreadsheetImportExportButtons,
  type SpreadsheetFeedback,
} from "./SpreadsheetImportExportButtons";
import { SolverActionButton } from "./SolverActionButton";
import { CheckDataButton } from "./CheckDataButton";
import {
  editorFeedbackErrorClass,
  editorFeedbackSuccessClass,
  editorInfoLegendClass,
  editorInfoMetaClass,
  editorInfoStripClass,
  editorToolbarBtnPrimary,
  editorToolbarDivider,
  editorToolbarShellClass,
} from "./editors/editorToolbarStyles";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";
import type { SchedulingInput } from "@/lib/scheduling/types";

type EditorPageKey =
  | "sections"
  | "instructors"
  | "rooms"
  | "timeslots"
  | "meeting-patterns"
  | "constraints";

type EditorPageHeaderProps = {
  current: EditorPageKey;
  title: string;
  subtitle: string;
  data: SchedulingInput;
};

function LegendDot({ className }: { className: string }) {
  return <span className={`inline-block size-2 shrink-0 rounded-full ${className}`} aria-hidden />;
}

export function EditorPageHeader({ current, title, subtitle, data }: EditorPageHeaderProps) {
  const { saveToBackend, isSaving, saveFeedback, autoSaveEnabled, autoRefreshEnabled } =
    useSchedulingData();
  const [spreadsheetFeedback, setSpreadsheetFeedback] = useState<SpreadsheetFeedback | null>(
    null,
  );
  const [solverError, setSolverError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <PageHeader title="Editor Table" subtitle={subtitle} />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="min-w-0">
        <EditorPageTitleDropdown current={current} title={title} />
      </div>

      <div className={editorToolbarShellClass}>
        <Button
          size="sm"
          radius="md"
          className={editorToolbarBtnPrimary}
          startContent={<CloudUpload className="size-3.5" aria-hidden />}
          onPress={() => void saveToBackend({ manual: true })}
          isLoading={isSaving}
        >
          Save
        </Button>
        <span className={editorToolbarDivider} aria-hidden />
        <SpreadsheetImportExportButtons
          data={data}
          onFeedbackChange={setSpreadsheetFeedback}
        />
        <span className={editorToolbarDivider} aria-hidden />
        {/* Check Data merged into Run Solver (SolverActionButton validates before solving).
            Hidden pending team discussion — reversible: remove `hidden` to restore. */}
        <div hidden>
          <CheckDataButton data={data} onErrorChange={setSolverError} />
        </div>
        <SolverActionButton data={data} onErrorChange={setSolverError} />
      </div>

      {solverError ? (
        <p className={editorFeedbackErrorClass}>{solverError}</p>
      ) : null}

      <div className={editorInfoStripClass}>
        <div className={editorInfoLegendClass}>
          <span className="inline-flex items-center gap-1.5">
            <LegendDot className="bg-emerald-500" />
            Your recent saves
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LegendDot className="bg-blue-500" />
            Server updates
          </span>
        </div>
        <p className={editorInfoMetaClass}>
          <span className="font-medium text-slate-600">Auto-save</span>{" "}
          {autoSaveEnabled ? "on" : "off"}
          <span className="mx-2 text-slate-300">·</span>
          <span className="font-medium text-slate-600">Auto-refresh</span>{" "}
          {autoRefreshEnabled ? "on" : "off"}
        </p>
      </div>

      {spreadsheetFeedback?.type === "success" && (
        <div className={editorFeedbackSuccessClass} role="status">
          {spreadsheetFeedback.message}
        </div>
      )}
      {spreadsheetFeedback?.type === "error" && (
        <div className={editorFeedbackErrorClass} role="alert">
          <p className="font-medium">{spreadsheetFeedback.message}</p>
          {spreadsheetFeedback.errors &&
          spreadsheetFeedback.errors.length > 0 &&
          hasLocatedIssues(spreadsheetFeedback.errors) ? (
            <div className="mt-3">
              <ValidationIssuesTable
                issues={spreadsheetFeedback.errors}
                maxRows={12}
                context="import"
              />
            </div>
          ) : spreadsheetFeedback.errors && spreadsheetFeedback.errors.length > 0 ? (
            <ul className="mt-2 space-y-2 text-sm font-normal">
              {spreadsheetFeedback.errors.map((error, index) => {
                const human = humanizeError(error, "import");
                return (
                  <li key={`${error.code}-${index}`} className="rounded-md bg-white/60 px-2 py-1.5">
                    <div className="font-semibold text-slate-900">{human.title}</div>
                    <div className="text-slate-700">{human.whatHappened}</div>
                    <div className="text-xs text-slate-600">How to fix: {human.howToFix}</div>
                  </li>
                );
              })}
            </ul>
          ) : spreadsheetFeedback.detail ? (
            <p className="mt-2 whitespace-pre-wrap text-sm font-normal">{spreadsheetFeedback.detail}</p>
          ) : null}
          <div className="mt-3">
            <SpreadsheetFormatHelp compact />
          </div>
        </div>
      )}

      {saveFeedback?.type === "success" && (
        <div className={`${editorFeedbackSuccessClass} space-y-1`}>
          <p>{saveFeedback.message}</p>
          {saveFeedback.warnings?.map((warning) => (
            <p key={warning} className="text-amber-800">
              Warning: {warning}
            </p>
          ))}
        </div>
      )}
      {saveFeedback?.type === "error" && (
        <p className={editorFeedbackErrorClass}>Save failed. {saveFeedback.message}</p>
      )}
      </div>
    </div>
  );
}

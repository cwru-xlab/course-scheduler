"use client";

import { useState } from "react";
import { Button } from "@heroui/button";

import { EditorPageTitleDropdown } from "./EditorPageTitleDropdown";
import {
  SpreadsheetImportExportButtons,
  type SpreadsheetFeedback,
} from "./SpreadsheetImportExportButtons";
import { SolverActionButton } from "./SolverActionButton";
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

export function EditorPageHeader({ current, title, subtitle, data }: EditorPageHeaderProps) {
  const { saveToBackend, isSaving, saveFeedback, autoSaveEnabled, autoRefreshEnabled } =
    useSchedulingData();
  const [spreadsheetFeedback, setSpreadsheetFeedback] = useState<SpreadsheetFeedback | null>(
    null,
  );

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="min-w-0">
        <EditorPageTitleDropdown current={current} title={title} />
        <p className="mt-1 text-slate-500">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <Button
          className="bg-weatherhead-primary text-white font-bold shadow-lg shadow-weatherhead-primary/20 hover:opacity-90"
          onPress={() => void saveToBackend({ manual: true })}
          isLoading={isSaving}
        >
          Save
        </Button>
        <SpreadsheetImportExportButtons
          data={data}
          onFeedbackChange={setSpreadsheetFeedback}
        />
        <SolverActionButton data={data} />
      </div>

      <div className="lg:col-span-2 rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
        <p className="text-pretty">
          Highlighted rows: <strong className="text-green-600">green</strong> = your recent saves,{" "}
          <strong className="text-blue-600">blue</strong> = updates from the server.
        </p>
        <p className="mt-1.5 text-pretty">
          {autoSaveEnabled ? (
            <>
              <span className="font-semibold text-slate-600">Auto-save</span> is on — edits publish
              automatically after you stop typing.
            </>
          ) : (
            <>
              <span className="font-semibold text-slate-600">Auto-save</span> is off — click Save to
              publish edits.
            </>
          )}{" "}
          {autoRefreshEnabled ? (
            <>
              <span className="font-semibold text-slate-600">Auto-refresh</span> is on — others&apos;
              updates load when you have no unsaved edits.
            </>
          ) : (
            <>
              <span className="font-semibold text-slate-600">Auto-refresh</span> is off — you will be
              prompted when another user saves.
            </>
          )}{" "}
          Change sync options in <span className="font-semibold text-slate-600">Settings</span> on the
          top bar.
        </p>
      </div>

      {spreadsheetFeedback?.type === "success" && (
        <div
          className="lg:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-sm font-semibold leading-snug text-emerald-700"
          role="status"
        >
          {spreadsheetFeedback.message}
        </div>
      )}
      {spreadsheetFeedback?.type === "error" && (
        <div
          className="lg:col-span-2 rounded-lg border border-red-200 bg-red-50/80 px-3 py-2.5 text-sm font-semibold leading-snug text-red-700"
          role="alert"
        >
          {spreadsheetFeedback.message}
        </div>
      )}

      {saveFeedback?.type === "success" && (
        <div className="lg:col-span-2 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5">
          <p className="text-sm font-semibold text-emerald-700">{saveFeedback.message}</p>
          {saveFeedback.warnings?.map((warning) => (
            <p key={warning} className="text-sm font-semibold text-amber-800">
              Warning: {warning}
            </p>
          ))}
        </div>
      )}
      {saveFeedback?.type === "error" && (
        <p className="lg:col-span-2 rounded-lg border border-red-200 bg-red-50/80 px-3 py-2.5 text-sm font-semibold text-red-700">
          Save failed. {saveFeedback.message}
        </p>
      )}
    </div>
  );
}

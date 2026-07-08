"use client";

import { Button } from "@heroui/button";

import { EditorPageTitleDropdown } from "./EditorPageTitleDropdown";
import { SpreadsheetImportExportButtons } from "./SpreadsheetImportExportButtons";
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
  const { saveToBackend, isSaving, saveFeedback } = useSchedulingData();

  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <EditorPageTitleDropdown current={current} title={title} />
        <p className="text-slate-500 mt-1">{subtitle}</p>
        <p className="text-xs text-slate-400 mt-1">
          Highlighted rows: green = your recent saves, blue = updates from the server.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <Button
          className="bg-weatherhead-primary text-white font-bold shadow-lg shadow-weatherhead-primary/20 hover:opacity-90"
          onPress={() => void saveToBackend()}
          isLoading={isSaving}
        >
          Save
        </Button>
        <SpreadsheetImportExportButtons data={data} />
        <SolverActionButton data={data} />
      </div>
      {saveFeedback?.type === "success" && (
        <div className="w-full space-y-2">
          <p className="text-sm text-emerald-600 font-semibold">{saveFeedback.message}</p>
          {saveFeedback.warnings?.map((warning) => (
            <p key={warning} className="text-sm text-amber-700 font-semibold">
              Warning: {warning}
            </p>
          ))}
        </div>
      )}
      {saveFeedback?.type === "error" && (
        <p className="w-full text-sm text-red-600 font-semibold">
          Save failed. {saveFeedback.message}
        </p>
      )}
    </div>
  );
}

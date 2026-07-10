"use client";

import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Tabs, Tab } from "@heroui/tabs";
import clsx from "clsx";
import { Rocket, AlertTriangle, BarChart3, CheckCircle2, Info } from "lucide-react";

import { SectionsEditor } from "./editors/SectionsEditor";
import { InstructorsEditor } from "./editors/InstructorsEditor";
import { RoomsEditor } from "./editors/RoomsEditor";
import { TimeslotsEditor } from "./editors/TimeslotsEditor";
import { MeetingPatternsEditor } from "./editors/MeetingPatternsEditor";
import {
  CrossListGroupsEditor,
  NoOverlapGroupsEditor,
  BlockedTimesEditor,
  LockedAssignmentsEditor,
  SoftLocksEditor,
} from "./editors/ConstraintsEditors";

import { ImportSpreadsheetWarningModal } from "@/components/scheduler/ImportSpreadsheetWarningModal";
import { collectRowNotesForExport } from "@/lib/notes/storage";
import { importSpreadsheetFile } from "@/lib/spreadsheet-import-client";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";
import { useSolverProgress } from "@/lib/solver-progress/SolverProgressContext";
import type { ScheduleSolution, SchedulingInput, ValidationError } from "@/lib/scheduling/types";

type ApiSuccess = ScheduleSolution & { status: "ok" };
type ApiError = {
  status: "error";
  errors: ValidationError[];
  diagnostics?: {
    feasible_if_relax?: string[];
    feasible_if_remove_section?: string[];
    feasible_if_remove_instructor?: { instructor_id: string; section_count: number }[];
  };
};

const LAST_SOLVER_RUN_STORAGE_KEY = "wsom-last-solver-run";

export const SchedulerDemo = () => {
  const router = useRouter();
  const { begin, succeed, fail } = useSolverProgress();
  const {
    data,
    isLoading,
    error,
    isFromLocalStorage,
    updateData,
    updateField,
    resetToMockData,
    hasUnsavedChanges,
    saveToBackend,
    isSaving,
  } = useSchedulingData();

  const [solution, setSolution] = useState<ScheduleSolution | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [diagnostics, setDiagnostics] = useState<ApiError["diagnostics"]>();
  const [solverStatus, setSolverStatus] = useState<"idle" | "loading">("idle");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [spreadsheetStatus, setSpreadsheetStatus] = useState<
    "idle" | "importing" | "import-success" | "import-error" | "exporting" | "export-error"
  >("idle");
  const [spreadsheetMessage, setSpreadsheetMessage] = useState("");
  const [importWarningOpen, setImportWarningOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const timeslotLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    data?.timeslots.forEach((slot) => {
      map.set(slot.id, `${slot.day} ${slot.start_time}-${slot.end_time}`);
    });
    return map;
  }, [data]);

  // Derived options for dropdowns (with labels)
  const sectionOptions = useMemo(
    () => data?.sections.map((s) => ({ key: s.id, label: `${s.id} (${s.course_id})` })) ?? [],
    [data]
  );

  const instructorOptions = useMemo(
    () =>
      data?.instructors.map((i) => ({
        key: i.id,
        label: `${i.name || i.id} (${i.rank_type})`,
      })) ?? [],
    [data]
  );

  const roomOptions = useMemo(
    () => data?.rooms.map((r) => ({ key: r.id, label: `${r.id} (${r.building}, cap: ${r.capacity})` })) ?? [],
    [data]
  );

  const timeslotOptions = useMemo(
    () => data?.timeslots.map((t) => ({ key: t.id, label: `${t.day} ${t.start_time}-${t.end_time}` })) ?? [],
    [data]
  );

  const meetingPatternOptions = useMemo(
    () => data?.meeting_patterns.map((p) => ({ key: p.id, label: `${p.id} (${p.allowed_days.join("/")})` })) ?? [],
    [data]
  );

  const crosslistGroupOptions = useMemo(
    () => data?.crosslist_groups.map((g) => ({ key: g.id, label: g.id })) ?? [],
    [data]
  );

  const markDirtyAndUpdateField = useCallback(
    <K extends keyof SchedulingInput>(field: K, value: SchedulingInput[K]) => {
      updateField(field, value);
    },
    [updateField],
  );

  const saveAll = async () => {
    setUpdateStatus("loading");
    setErrors([]);
    setDiagnostics(undefined);
    const ok = await saveToBackend({ manual: true });
    if (ok) {
      setUpdateStatus("success");
    } else {
      setErrors([
        {
          code: "save_failed",
          message: "Failed to save changes.",
        },
      ]);
      setUpdateStatus("error");
    }
    setTimeout(() => setUpdateStatus("idle"), 3000);
  };

  const runSolver = async (removeInstructors?: string[]) => {
    if (!data) return;
    setSolverStatus("loading");
    setErrors([]);
    setSolution(null);
    setDiagnostics(undefined);
    begin();

    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          ...(removeInstructors?.length ? { remove_instructors: removeInstructors } : {}),
        }),
      });
      const result = (await response.json()) as ApiSuccess | ApiError;

      if (!response.ok || result.status === "error") {
        fail();
        setErrors(
          result.status === "error"
            ? result.errors
            : [{ code: "unknown", message: "Unknown solver error." }]
        );
        if (result.status === "error") {
          setDiagnostics(result.diagnostics);
        }
      } else {
        setSolution(result);
        if (typeof window !== "undefined") {
          localStorage.setItem(
            LAST_SOLVER_RUN_STORAGE_KEY,
            JSON.stringify({
              input: data,
              solution: result,
              createdAt: new Date().toISOString(),
            }),
          );
        }
        succeed();
        router.push("/calendar");
      }
    } catch (err) {
      fail();
      const message = err instanceof Error ? err.message : "Failed to reach solver API.";
      setErrors([{ code: "network_error", message }]);
    } finally {
      setSolverStatus("idle");
    }
  };

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
    setErrors([]);

    try {
      const result = await importSpreadsheetFile(file);
      if (!result.ok) {
        setErrors(result.errors);
        setSpreadsheetStatus("import-error");
        setSpreadsheetMessage(result.message);
        return;
      }

      updateData(result.scheduling_input);
      setSolution(null);
      setDiagnostics(undefined);
      setSpreadsheetStatus("import-success");
      setSpreadsheetMessage(result.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import spreadsheet.";
      setErrors([{ code: "network_error", message }]);
      setSpreadsheetStatus("import-error");
      setSpreadsheetMessage(message);
    } finally {
      event.target.value = "";
      setTimeout(() => setSpreadsheetStatus("idle"), 3000);
    }
  };

  const exportSpreadsheet = async () => {
    if (!data) return;
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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500 dark:text-default-500">
        <div className="size-10 border-2 border-weatherhead-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium">Loading scheduling data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-6 flex items-center gap-3">
        <AlertTriangle className="size-6 text-red-600 dark:text-red-400 shrink-0" />
        <p className="text-sm font-medium text-red-800 dark:text-red-200">Error: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white dark:bg-default-100 border border-slate-200 dark:border-default-200 rounded-xl p-6 text-center text-slate-500 dark:text-default-500">
        No data available.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Status Bar - Weatherhead card style */}
      <div className="bg-white dark:bg-default-100 border border-slate-200 dark:border-default-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-col items-start gap-1">
            <h2 className="text-xl font-bold text-slate-900 dark:text-foreground">Data Overview</h2>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-default-500">
              <span>Data source:</span>
              <span className={clsx(
                "inline-flex items-center px-2 py-0.5 rounded text-xs font-bold",
                isFromLocalStorage ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-weatherhead-primary/10 text-weatherhead-primary"
              )}>
                {isFromLocalStorage ? "Local Storage" : "Mock Data"}
              </span>
              {hasUnsavedChanges && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                  Unsaved changes
                </span>
              )}
            </div>
          </div>
          <Button
            size="sm"
            className="bg-slate-100 dark:bg-default-100 text-slate-700 dark:text-foreground font-bold border border-slate-200 dark:border-default-200"
            onPress={async () => {
              await resetToMockData();
            }}
          >
            Reset to Mock Data
          </Button>
        </div>
        <div className="grid gap-3 text-sm text-slate-600 dark:text-default-500 mt-4 sm:grid-cols-3 lg:grid-cols-5">
          <div>Sections: <span className="font-bold text-slate-900 dark:text-foreground">{data.sections.length}</span></div>
          <div>Instructors: <span className="font-bold text-slate-900 dark:text-foreground">{data.instructors.length}</span></div>
          <div>Rooms: <span className="font-bold text-slate-900 dark:text-foreground">{data.rooms.length}</span></div>
          <div>Timeslots: <span className="font-bold text-slate-900 dark:text-foreground">{data.timeslots.length}</span></div>
          <div>Patterns: <span className="font-bold text-slate-900 dark:text-foreground">{data.meeting_patterns.length}</span></div>
          <div>Cross-list: <span className="font-bold text-slate-900 dark:text-foreground">{data.crosslist_groups.length}</span></div>
          <div>No-Overlap: <span className="font-bold text-slate-900 dark:text-foreground">{data.no_overlap_groups.length}</span></div>
          <div>Blocked: <span className="font-bold text-slate-900 dark:text-foreground">{data.blocked_times.length}</span></div>
          <div>Hard Locks: <span className="font-bold text-slate-900 dark:text-foreground">{data.locked_assignments.length}</span></div>
          <div>Soft Locks: <span className="font-bold text-slate-900 dark:text-foreground">{data.soft_locks.length}</span></div>
        </div>
      </div>

      {/* Validation Errors - Weatherhead red left border panel */}
      {errors.length > 0 && (
        <div className="bg-white dark:bg-default-100 border-l-4 border-l-red-500 border-y border-r border-slate-200 dark:border-default-200 rounded-r-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="size-10 rounded-lg bg-red-50 dark:bg-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400">
              <AlertTriangle className="size-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-foreground">Validation Errors</h3>
              <p className="text-sm text-slate-500 dark:text-default-500">{errors.length} issue(s) to resolve</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-default-200">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-default-100 text-slate-500 dark:text-default-500 text-[10px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Suggested fix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-default-100">
                {errors.map((err) => (
                  <tr key={`${err.code}-${err.message}`} className="hover:bg-slate-50 dark:hover:bg-default-50 transition-colors">
                    <td className="px-4 py-4 text-xs font-mono text-red-600 dark:text-red-400 font-bold">{err.code}</td>
                    <td className="px-4 py-4 text-sm text-slate-700 dark:text-default-700 font-medium">{err.message}</td>
                    <td className="px-4 py-4 text-right text-xs text-slate-500 dark:text-default-500">
                      {diagnostics?.feasible_if_relax?.length ? `Try relaxing: ${diagnostics.feasible_if_relax.join(", ")}. ` : ""}
                      {diagnostics?.feasible_if_remove_instructor?.length ? `Feasible if removing instructor(s): ${diagnostics.feasible_if_remove_instructor.map((i) => `${i.instructor_id} (${i.section_count} sections)`).join(", ")}.` : ""}
                      {diagnostics?.feasible_if_remove_section?.length ? `Or remove section(s): ${diagnostics.feasible_if_remove_section.join(", ")}.` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {diagnostics?.feasible_if_remove_instructor?.length ? (
              <div className="mt-4 px-4 pb-4 flex items-center gap-3">
                <Button
                  size="sm"
                  color="warning"
                  variant="flat"
                  isLoading={solverStatus === "loading"}
                  onPress={() => {
                    const ids = diagnostics.feasible_if_remove_instructor!.map((i) => i.instructor_id);
                    runSolver(ids);
                  }}
                >
                  Retry without {diagnostics.feasible_if_remove_instructor.length} instructor(s)
                </Button>
                <span className="text-xs text-slate-400 dark:text-default-400">
                  Removes {diagnostics.feasible_if_remove_instructor.reduce((s, i) => s + i.section_count, 0)} sections
                  ({diagnostics.feasible_if_remove_instructor.map((i) => i.instructor_id).join(", ")})
                </span>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Global Update Button */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          className={clsx(
            "font-bold shadow-lg transition-all",
            hasUnsavedChanges && updateStatus !== "loading"
              ? "bg-weatherhead-primary text-white shadow-weatherhead-primary/20 hover:opacity-90"
              : "bg-slate-100 dark:bg-default-100 text-slate-500 dark:text-default-500 cursor-not-allowed"
          )}
          onPress={saveAll}
          isLoading={updateStatus === "loading" || isSaving}
          isDisabled={!hasUnsavedChanges || updateStatus === "loading" || isSaving}
        >
          Save
        </Button>
        {updateStatus === "success" && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold">All changes saved.</span>
        )}
        {updateStatus === "error" && (
          <span className="text-sm text-red-600 dark:text-red-400 font-semibold">Failed to save. Please try again.</span>
        )}
        {!hasUnsavedChanges && updateStatus === "idle" && (
          <span className="text-xs text-slate-400 dark:text-default-400">All changes saved.</span>
        )}
      </div>

      {/* Tabbed Editors - Weatherhead white card with border-b tabs */}
      <div className="bg-white dark:bg-default-100 rounded-xl border border-slate-200 dark:border-default-200 shadow-sm overflow-hidden">
      <Tabs
        aria-label="Data editors"
        classNames={{
          tabList: "gap-8 border-b border-slate-200 dark:border-default-200 px-6 bg-transparent rounded-none",
          cursor: "bg-weatherhead-primary",
          tab: "text-slate-500 dark:text-default-500 data-[selected=true]:text-weatherhead-primary font-semibold",
          panel: "p-4 sm:p-6",
        }}
      >
        <Tab key="sections" title="Sections">
          <div className="flex flex-col gap-4">
            <SectionsEditor
              sections={data.sections}
              instructorOptions={instructorOptions}
              meetingPatternOptions={meetingPatternOptions}
              crosslistGroupOptions={crosslistGroupOptions}
              onUpdate={(sections) => markDirtyAndUpdateField("sections", sections)}
            />
          </div>
        </Tab>
        <Tab key="instructors" title="Instructors">
          <InstructorsEditor
            instructors={data.instructors}
            meetingPatternOptions={meetingPatternOptions}
            timeslotOptions={timeslotOptions}
            onUpdate={(instructors) => markDirtyAndUpdateField("instructors", instructors)}
          />
        </Tab>
        <Tab key="rooms" title="Rooms">
          <RoomsEditor
            rooms={data.rooms}
            onUpdate={(rooms) => markDirtyAndUpdateField("rooms", rooms)}
          />
        </Tab>
        <Tab key="timeslots" title="Timeslots">
          <TimeslotsEditor
            timeslots={data.timeslots}
            onUpdate={(timeslots) => markDirtyAndUpdateField("timeslots", timeslots)}
          />
        </Tab>
        <Tab key="patterns" title="Meeting Patterns">
          <MeetingPatternsEditor
            meetingPatterns={data.meeting_patterns}
            timeslotOptions={timeslotOptions}
            onUpdate={(patterns) => markDirtyAndUpdateField("meeting_patterns", patterns)}
          />
        </Tab>
        <Tab key="constraints" title="Constraints">
          <div className="flex flex-col gap-4">
            <CrossListGroupsEditor
              groups={data.crosslist_groups}
              sectionOptions={sectionOptions}
              onUpdate={(groups) => markDirtyAndUpdateField("crosslist_groups", groups)}
            />
            <NoOverlapGroupsEditor
              groups={data.no_overlap_groups}
              sectionOptions={sectionOptions}
              onUpdate={(groups) => markDirtyAndUpdateField("no_overlap_groups", groups)}
            />
            <BlockedTimesEditor
              blockedTimes={data.blocked_times}
              instructorOptions={instructorOptions}
              roomOptions={roomOptions}
              onUpdate={(blockedTimes) => markDirtyAndUpdateField("blocked_times", blockedTimes)}
            />
            <LockedAssignmentsEditor
              lockedAssignments={data.locked_assignments}
              sectionOptions={sectionOptions}
              timeslotOptions={timeslotOptions}
              roomOptions={roomOptions}
              onUpdate={(locks) => markDirtyAndUpdateField("locked_assignments", locks)}
            />
            <SoftLocksEditor
              softLocks={data.soft_locks}
              sectionOptions={sectionOptions}
              timeslotOptions={timeslotOptions}
              roomOptions={roomOptions}
              onUpdate={(locks) => markDirtyAndUpdateField("soft_locks", locks)}
            />
          </div>
        </Tab>
      </Tabs>
      </div>

      {/* Run Solver - Weatherhead primary CTA */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          className="flex items-center gap-2 bg-weatherhead-primary text-white font-bold shadow-lg shadow-weatherhead-primary/20 hover:opacity-90 transition-all"
          onPress={() => runSolver()}
          isLoading={solverStatus === "loading"}
          startContent={solverStatus === "idle" ? <Rocket className="size-4" /> : undefined}
        >
          Run Solver
        </Button>
        <span className="text-sm text-slate-500 dark:text-default-500">
          Uses current edited data (auto-saved to local storage)
        </span>
      </div>

      <ImportSpreadsheetWarningModal
        isOpen={importWarningOpen}
        onCancel={() => setImportWarningOpen(false)}
        onConfirm={handleImportWarningConfirm}
      />
      <div className="flex items-center gap-3 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xlsm,.xls"
          className="hidden"
          onChange={(event) => {
            void handleSpreadsheetFileSelected(event);
          }}
        />
        <Button
          className="bg-slate-100 dark:bg-default-100 text-slate-700 dark:text-foreground font-bold border border-slate-200 dark:border-default-200"
          onPress={handleImportButtonPress}
          isLoading={spreadsheetStatus === "importing"}
        >
          Import Spreadsheet
        </Button>
        <Button
          className="bg-slate-100 dark:bg-default-100 text-slate-700 dark:text-foreground font-bold border border-slate-200 dark:border-default-200"
          onPress={exportSpreadsheet}
          isLoading={spreadsheetStatus === "exporting"}
        >
          Export Spreadsheet
        </Button>
        {spreadsheetStatus === "import-success" && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold">{spreadsheetMessage}</span>
        )}
        {(spreadsheetStatus === "import-error" || spreadsheetStatus === "export-error") && (
          <span className="text-sm text-red-600 dark:text-red-400 font-semibold">{spreadsheetMessage}</span>
        )}
      </div>

      {/* Solution Display - Weatherhead score card + assignments table */}
      {solution && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-default-100 rounded-xl border border-slate-200 dark:border-default-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-foreground">Solver Score</h3>
                <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-full">
                  OK
                </span>
              </div>
              <div className="flex flex-col items-center py-4">
                <div className="text-4xl font-black text-weatherhead-primary">{solution.total_score.toFixed(0)}</div>
                <p className="text-slate-400 dark:text-default-400 text-sm font-medium mt-1">Total penalty (lower is better)</p>
              </div>
              <div className="space-y-4 mt-4">
                {Object.entries(solution.penalty_breakdown).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-default-500 capitalize">{key.replace(/_/g, " ")}</span>
                    <span className="font-bold text-slate-900 dark:text-foreground">{value.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-default-100 rounded-xl border border-slate-200 dark:border-default-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-default-100 flex items-center gap-3">
                <div className="size-10 rounded-lg bg-weatherhead-primary/10 flex items-center justify-center text-weatherhead-primary">
                  <BarChart3 className="size-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-foreground">Final Assignments</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-default-100 text-slate-500 dark:text-default-500 text-[10px] font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Section</th>
                      <th className="px-6 py-4">Pattern</th>
                      <th className="px-6 py-4">Times</th>
                      <th className="px-6 py-4">Room</th>
                      <th className="px-6 py-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-default-100">
                    {solution.assignments.map((a) => (
                      <tr key={a.section_id} className="hover:bg-slate-50 dark:hover:bg-default-50 transition-colors">
                        <td className="px-6 py-4 font-bold text-sm text-slate-900 dark:text-foreground">{a.section_id}</td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-default-600">{a.meeting_pattern_id}</td>
                        <td className="px-6 py-4 text-sm text-slate-700 dark:text-default-700">
                          {a.timeslot_ids.map((id) => timeslotLabelMap.get(id) ?? id).join(", ")}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-foreground">{a.room_id}</td>
                        <td className="px-6 py-4 text-center">
                          <CheckCircle2 className="size-5 text-emerald-500 inline-block" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {solution.explanations.length > 0 && (
              <div className="bg-weatherhead-primary/5 dark:bg-weatherhead-primary/10 rounded-xl border border-weatherhead-primary/10 p-4 flex gap-3">
                <Info className="size-5 text-weatherhead-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-weatherhead-primary">Explanations</h4>
                  <ul className="space-y-2 text-xs text-slate-600 dark:text-default-600 mt-1 list-disc list-inside">
                    {solution.explanations.map((explanation, idx) => (
                      <li key={idx}>{explanation}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

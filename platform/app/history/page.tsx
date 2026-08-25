"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Activity, Archive, CalendarDays, Download, FolderOpen, Pencil, Trash2, User } from "lucide-react";

import {
  deleteSavedSchedule,
  exportSavedSchedule,
  listSavedSchedules,
  loadSavedScheduleToCurrentView,
  renameSavedSchedule,
  LAST_SOLVER_RUN_STORAGE_KEY,
  type SavedScheduleEntry,
} from "@/lib/scheduling/history";
import type { LastSolverRunSnapshot } from "@/lib/scheduling/history";
import type { SchedulingDataRevision } from "@/lib/scheduling/dataRevision";
import { useSharedScheduleMeta } from "@/lib/shared-schedule-client";
import type { ValidationError } from "@/lib/scheduling/types";
import { ValidationIssuesTable } from "@/components/scheduler/ValidationIssuesTable";
import { SpreadsheetFormatHelp } from "@/components/scheduler/SpreadsheetFormatHelp";
import { ViewportModal } from "@/components/scheduler/ViewportModal";
import {
  appNativeBtnPrimary,
  appNativeBtnSecondary,
  appNativeBtnDanger,
} from "@/lib/ui/appChromeStyles";
import { PageHeader } from "@/components/layout/PageHeader";

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

export default function HistoryPage() {
  const [items, setItems] = useState<SavedScheduleEntry[]>([]);
  const [exportFeedback, setExportFeedback] = useState<{
    entryId: string;
    message: string;
    errors: ValidationError[];
    detail: string;
  } | null>(null);

  // Rename modal state
  const [renameModal, setRenameModal] = useState<{
    entry: SavedScheduleEntry;
    newName: string;
  } | null>(null);

  // Delete confirmation modal state
  const [deleteConfirm, setDeleteConfirm] = useState<SavedScheduleEntry | null>(null);

  const refresh = async () => {
    setItems(await listSavedSchedules());
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Read the currently displayed snapshot from localStorage (same one the calendar uses).
  // This lets us show the loaded schedule's metadata rather than only the live shared schedule.
  const [displayedSnapshot, setDisplayedSnapshot] = useState<LastSolverRunSnapshot | null>(null);

  const readDisplayedSnapshot = () => {
    try {
      const raw = localStorage.getItem(LAST_SOLVER_RUN_STORAGE_KEY);
      if (raw) {
        setDisplayedSnapshot(JSON.parse(raw) as LastSolverRunSnapshot);
      }
    } catch {
      // ignore malformed data
    }
  };

  useEffect(() => {
    readDisplayedSnapshot();
    const handler = () => readDisplayedSnapshot();
    window.addEventListener("lastSolverRunUpdated", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("lastSolverRunUpdated", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  // Live data revision from the server (polls every 4s).
  const liveMeta = useSharedScheduleMeta();

  // "Data edited" display revision: starts from the localStorage snapshot (what was loaded),
  // then overridden by the live server value whenever it changes.
  const snapshotRevisionIdRef = useRef<string | null>(null);
  const [displayedDataRevision, setDisplayedDataRevision] = useState<SchedulingDataRevision | null>(null);
  useEffect(() => {
    const snapRev = displayedSnapshot?.dataRevision;
    if (snapRev && snapRev.lastModifiedAt !== snapshotRevisionIdRef.current) {
      snapshotRevisionIdRef.current = snapRev.lastModifiedAt;
      setDisplayedDataRevision(snapRev);
    }
  }, [displayedSnapshot?.dataRevision]);
  useEffect(() => {
    if (liveMeta.dataRevision && snapshotRevisionIdRef.current) {
      setDisplayedDataRevision(liveMeta.dataRevision);
    }
  }, [liveMeta.dataRevision]);
  const displayedAssignments = (() => {
    const solution = displayedSnapshot?.solution as
      | { assignments?: unknown[] }
      | undefined;
    return solution?.assignments?.length ?? 0;
  })();
  const dataEditedAfterPublish = useMemo(() => {
    if (!displayedSnapshot || !displayedDataRevision) return false;
    const editedAt = new Date(displayedDataRevision.lastModifiedAt).getTime();
    const publishedAt = new Date(displayedSnapshot.createdAt).getTime();
    return !Number.isNaN(editedAt) && !Number.isNaN(publishedAt) && editedAt > publishedAt;
  }, [displayedDataRevision, displayedSnapshot]);

  const handleRename = async () => {
    if (!renameModal || !renameModal.newName.trim()) return;
    await renameSavedSchedule(renameModal.entry.id, renameModal.newName);
    setRenameModal(null);
    await refresh();
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteSavedSchedule(deleteConfirm.id);
    setDeleteConfirm(null);
    await refresh();
  };

  const totalAssignments = useMemo(
    () =>
      items.reduce((sum, item) => sum + (item.snapshot.solution.assignments?.length ?? 0), 0),
    [items],
  );

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <PageHeader
        title="Schedule History"
        subtitle="Load, export, and manage schedules you saved from calendar edits."
        actions={
          <Link href="/calendar" className={appNativeBtnPrimary}>
            <CalendarDays className="size-4" />
            Back to Calendar
          </Link>
        }
      />

      {exportFeedback ? (
        <div
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          <p className="font-semibold">{exportFeedback.message}</p>
          {exportFeedback.errors.length > 0 ? (
            <div className="mt-3 rounded-lg border border-rose-100 bg-white/70 p-3">
              <ValidationIssuesTable
                issues={exportFeedback.errors}
                maxRows={6}
                context="export"
              />
            </div>
          ) : exportFeedback.detail ? (
            <p className="mt-2 whitespace-pre-wrap text-sm">{exportFeedback.detail}</p>
          ) : null}
          <div className="mt-3">
            <SpreadsheetFormatHelp compact />
          </div>
          <button
            type="button"
            className="mt-3 text-xs font-semibold text-rose-800 underline hover:text-rose-950"
            onClick={() => setExportFeedback(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div
        className="sticky top-[calc(4rem+1rem)] z-40 rounded-xl border border-sky-200 bg-sky-50/80 backdrop-blur-md p-4 shadow-sm ring-1 ring-sky-100"
        aria-label="Active schedule"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">{displayedSnapshot?.name || "Active schedule"}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span className="hidden sm:inline text-slate-300" aria-hidden>
                •
              </span>
              <span>
                {displayedDataRevision
                  ? `Data edited ${
                      displayedDataRevision.lastModifiedByName
                        ? `by ${displayedDataRevision.lastModifiedByName}`
                        : ""
                    } at ${new Date(displayedDataRevision.lastModifiedAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}`
                  : "Data not saved to the server yet"}
              </span>
              {displayedSnapshot ? (
                <>
                  <span className="hidden sm:inline text-slate-300" aria-hidden>
                    •
                  </span>
                  <span>
                    Last solved/published
                    {displayedSnapshot.createdAt
                      ? ` at ${new Date(displayedSnapshot.createdAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}`
                      : ""}
                  </span>
                </>
              ) : null}
            </div>
            {displayedSnapshot ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span>
                  Assignments:{" "}
                  <span className="font-semibold text-slate-900">{displayedAssignments}</span>
                </span>
                {dataEditedAfterPublish ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                    View predates latest data edit — rerun the solver to refresh
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                The current working schedule is shown here for everyone. Run the solver or edit
                the calendar to create one.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
          <span>
            Saved schedules: <span className="font-bold text-slate-900">{items.length}</span>
          </span>
          <span>
            Total assignments:{" "}
            <span className="font-bold text-slate-900">{totalAssignments}</span>
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-10 text-center">
          <Archive className="mx-auto size-10 text-slate-400" />
          <h2 className="mt-3 text-lg font-bold text-slate-900">No saved schedules yet</h2>
          <p className="mt-1 text-sm text-slate-500">
            Open the calendar, run or edit a schedule, then use Save Schedule.
          </p>
          <Link href="/calendar" className={`mt-5 ${appNativeBtnSecondary}`}>
            <CalendarDays className="size-4" />
            Go to Calendar
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1.5 min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 truncate">{item.name}</h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>
                      Term date:{" "}
                      <span className="font-semibold text-slate-700">{item.scheduleDate}</span>
                    </span>
                    <span className="hidden sm:inline text-slate-300" aria-hidden>
                      •
                    </span>
                    <span>
                      Saved:{" "}
                      <span className="font-semibold text-slate-700">{fmtDate(item.savedAt)}</span>
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                    <User className="size-3.5 shrink-0 text-slate-500" aria-hidden />
                    <span>
                      Saved by{" "}
                      <span className="font-semibold text-slate-900">
                        {item.savedByName?.trim() ||
                          item.savedBy?.trim() ||
                          item.savedByUserId?.trim() ||
                          "Unknown user"}
                      </span>
                    </span>
                  </div>
                  <div className="text-xs text-slate-600">
                    Assignments:{" "}
                    <span className="font-semibold text-slate-900">
                      {item.snapshot.solution.assignments?.length ?? 0}
                    </span>
                    {" • "}Locked sections:{" "}
                    <span className="font-semibold text-slate-900">
                      {Object.keys(item.snapshot.sectionLocks ?? {}).length}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      loadSavedScheduleToCurrentView(item);
                      window.dispatchEvent(new Event("lastSolverRunUpdated"));
                    }}
                    className={appNativeBtnPrimary}
                  >
                    <FolderOpen className="size-4" />
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setExportFeedback(null);
                      const result = await exportSavedSchedule(item);
                      if (!result.ok) {
                        setExportFeedback({
                          entryId: item.id,
                          message: result.message,
                          errors: result.errors,
                          detail: result.detail,
                        });
                      }
                    }}
                    className={appNativeBtnSecondary}
                  >
                    <Download className="size-4" />
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenameModal({ entry: item, newName: item.name })}
                    className={appNativeBtnSecondary}
                  >
                    <Pencil className="size-4" />
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(item)}
                    className={appNativeBtnDanger}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rename Modal */}
      <ViewportModal isOpen={Boolean(renameModal)} onClose={() => setRenameModal(null)}>
        {renameModal ? (
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 id="rename-modal-title" className="text-lg font-bold text-slate-900">
                Rename Schedule
              </h3>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                onClick={() => setRenameModal(null)}
              >
                Cancel
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label
                  htmlFor="rename-input"
                  className="block text-sm font-semibold text-slate-700 mb-1"
                >
                  Schedule Name
                </label>
                <input
                  id="rename-input"
                  type="text"
                  value={renameModal.newName}
                  onChange={(e) =>
                    setRenameModal({ ...renameModal, newName: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameModal(null)}
                  className={appNativeBtnSecondary}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRename}
                  disabled={!renameModal.newName.trim()}
                  className={appNativeBtnPrimary}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </ViewportModal>

      {/* Delete Confirmation Modal */}
      <ViewportModal isOpen={Boolean(deleteConfirm)} onClose={() => setDeleteConfirm(null)}>
        {deleteConfirm ? (
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 id="delete-modal-title" className="text-lg font-bold text-slate-900">
                Delete Schedule?
              </h3>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-700">
                Are you sure you want to delete{" "}
                <span className="font-semibold">&quot;{deleteConfirm.name}&quot;</span>?
              </p>
              <p className="text-sm text-slate-500">This action cannot be undone.</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className={appNativeBtnSecondary}
                >
                  Cancel
                </button>
                <button type="button" onClick={handleDelete} className={appNativeBtnDanger}>
                  <Trash2 className="size-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </ViewportModal>
    </div>
  );
}

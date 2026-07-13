"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CalendarDays, Download, FolderOpen, Trash2 } from "lucide-react";

import {
  deleteSavedSchedule,
  exportSavedSchedule,
  listSavedSchedules,
  loadSavedScheduleToCurrentView,
  type SavedScheduleEntry,
} from "@/lib/scheduling/history";
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
  const router = useRouter();
  const [items, setItems] = useState<SavedScheduleEntry[]>([]);

  const refresh = () => {
    setItems(listSavedSchedules());
  };

  useEffect(() => {
    refresh();
  }, []);

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
                <div className="space-y-1 min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 truncate">{item.name}</h2>
                  <div className="text-xs text-slate-500">
                    Term date: {item.scheduleDate} • Saved: {fmtDate(item.savedAt)}
                    {item.savedBy ? (
                      <>
                        {" • "}Saved by:{" "}
                        <span className="font-semibold text-slate-700">{item.savedBy}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="text-xs text-slate-600">
                    Assignments:{" "}
                    <span className="font-semibold text-slate-900">
                      {item.snapshot.solution.assignments?.length ?? 0}
                    </span>
                    {" • "}Locked sections:{" "}
                    <span className="font-semibold text-slate-900">
                      {item.snapshot.lockedSectionIds?.length ?? 0}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      loadSavedScheduleToCurrentView(item);
                      router.push("/calendar");
                    }}
                    className={appNativeBtnPrimary}
                  >
                    <FolderOpen className="size-4" />
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportSavedSchedule(item)}
                    className={appNativeBtnSecondary}
                  >
                    <Download className="size-4" />
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deleteSavedSchedule(item.id);
                      refresh();
                    }}
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
    </div>
  );
}

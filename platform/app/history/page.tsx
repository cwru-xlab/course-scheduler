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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Schedule History
          </h1>
          <p className="text-slate-500 text-base">
            Load, export, and manage schedules you saved from calendar edits.
          </p>
        </div>
        <Link
          href="/calendar"
          className="inline-flex items-center justify-center rounded-lg h-10 px-4 bg-[#137fec] text-white font-bold gap-2 shadow-lg shadow-[#137fec]/20 hover:bg-[#0f6dca]"
        >
          <CalendarDays className="size-4" />
          Back to Calendar
        </Link>
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
          <Link
            href="/calendar"
            className="mt-5 inline-flex items-center justify-center rounded-lg h-10 px-4 bg-slate-100 text-slate-800 font-bold border border-slate-200 hover:bg-slate-200"
          >
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
                    className="inline-flex items-center justify-center rounded-lg h-9 px-3 bg-[#137fec] text-white text-sm font-bold gap-2 hover:bg-[#0f6dca]"
                  >
                    <FolderOpen className="size-4" />
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => exportSavedSchedule(item)}
                    className="inline-flex items-center justify-center rounded-lg h-9 px-3 bg-slate-100 text-slate-800 text-sm font-bold gap-2 border border-slate-200 hover:bg-slate-200"
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
                    className="inline-flex items-center justify-center rounded-lg h-9 px-3 bg-rose-50 text-rose-700 text-sm font-bold gap-2 border border-rose-200 hover:bg-rose-100"
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

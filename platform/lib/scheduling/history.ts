"use client";

import type { ScheduleSolution, SchedulingInput } from "./types";

export const LAST_SOLVER_RUN_STORAGE_KEY = "wsom-last-solver-run";
export const LAST_SOLVER_ERROR_STORAGE_KEY = "wsom-last-solver-error";
const SCHEDULE_HISTORY_STORAGE_KEY = "wsom-schedule-history-v1";

export type LastSolverRunSnapshot = {
  input: SchedulingInput;
  solution: ScheduleSolution;
  createdAt: string;
  lockedSectionIds?: string[];
};

export type SavedScheduleEntry = {
  id: string;
  name: string;
  scheduleDate: string;
  savedAt: string;
  snapshot: LastSolverRunSnapshot;
};

const parseHistory = (raw: string | null): SavedScheduleEntry[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedScheduleEntry => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<SavedScheduleEntry>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.scheduleDate === "string" &&
        typeof candidate.savedAt === "string" &&
        !!candidate.snapshot &&
        typeof candidate.snapshot === "object"
      );
    });
  } catch {
    return [];
  }
};

export const listSavedSchedules = (): SavedScheduleEntry[] => {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(SCHEDULE_HISTORY_STORAGE_KEY);
  return parseHistory(raw).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
};

export const saveScheduleToHistory = (params: {
  name: string;
  scheduleDate: string;
  snapshot: LastSolverRunSnapshot;
}): SavedScheduleEntry => {
  if (typeof window === "undefined") {
    throw new Error("Schedule history is only available in the browser.");
  }
  const existing = listSavedSchedules();
  const entry: SavedScheduleEntry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    name: params.name.trim(),
    scheduleDate: params.scheduleDate,
    savedAt: new Date().toISOString(),
    snapshot: params.snapshot,
  };
  const next = [entry, ...existing];
  window.localStorage.setItem(SCHEDULE_HISTORY_STORAGE_KEY, JSON.stringify(next));
  return entry;
};

export const deleteSavedSchedule = (id: string): void => {
  if (typeof window === "undefined") return;
  const next = listSavedSchedules().filter((item) => item.id !== id);
  window.localStorage.setItem(SCHEDULE_HISTORY_STORAGE_KEY, JSON.stringify(next));
};

export const loadSavedScheduleToCurrentView = (entry: SavedScheduleEntry): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    LAST_SOLVER_RUN_STORAGE_KEY,
    JSON.stringify(entry.snapshot),
  );
};

export const exportSavedSchedule = async (entry: SavedScheduleEntry): Promise<void> => {
  if (typeof window === "undefined") return;

  const safeDate = entry.scheduleDate.replace(/[^0-9-]/g, "") || "schedule";
  const safeName = entry.name.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "");

  try {
    const response = await fetch("/api/export-scheduling-spreadsheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: entry.snapshot.input, notes: [] }),
    });

    if (!response.ok) {
      let message = "Failed to export spreadsheet.";
      try {
        const payload = (await response.json()) as {
          errors?: Array<{ message?: string }>;
        };
        message = payload.errors?.[0]?.message ?? message;
      } catch {
        // Keep fallback message.
      }
      console.error(message);
      alert(message);
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeDate}-${safeName || "saved-schedule"}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reach export service.";
    console.error(message);
    alert(message);
  }
};

"use client";

import type { ScheduleSolution, SchedulingInput, SectionLockState, ValidationError } from "./types";
import type { SchedulingDataRevision } from "@/lib/scheduling/dataRevision";
import { enrichSpreadsheetErrors, formatErrorsDetail, formatErrorsSummary, normalizeNetworkError } from "@/lib/spreadsheet/formatGuide";

export const LAST_SOLVER_RUN_STORAGE_KEY = "wsom-last-solver-run";
export const LAST_SOLVER_ERROR_STORAGE_KEY = "wsom-last-solver-error";
/**
 * Session flag set when the user loads a schedule from History into the
 * calendar. The calendar reads it once on mount so that an incoming shared
 * schedule from another user does not silently overwrite the history view.
 */
export const VIEW_FROM_HISTORY_KEY = "wsom-view-from-history";

export type LastSolverRunSnapshot = {
  input: SchedulingInput;
  solution: ScheduleSolution;
  createdAt: string;
  sectionLocks?: Record<string, SectionLockState>;
  /** Data revision (last editor save) in effect when this snapshot was created. */
  dataRevision?: SchedulingDataRevision;
  /** Name of the saved schedule this snapshot was loaded from (when applicable). */
  name?: string;
};

/** True when a snapshot has the fields `applyRunSnapshot` needs (avoids runtime .map crashes). */
export function isValidLastSolverRunSnapshot(
  value: unknown,
): value is LastSolverRunSnapshot {
  if (!value || typeof value !== "object") return false;
  const snap = value as Record<string, unknown>;
  const input = snap.input;
  const solution = snap.solution;
  if (!input || typeof input !== "object") return false;
  if (!solution || typeof solution !== "object") return false;
  const sections = (input as { sections?: unknown }).sections;
  const assignments = (solution as { assignments?: unknown }).assignments;
  return Array.isArray(sections) && Array.isArray(assignments);
}

export type SavedScheduleEntry = {
  id: string;
  name: string;
  scheduleDate: string;
  savedAt: string;
  /** Display name of the user who saved this schedule (when known). */
  savedBy?: string;
  /** Network ID of the user who saved this schedule. */
  savedByUserId?: string;
  /** Display name of the user who saved this schedule. */
  savedByName?: string;
  snapshot: LastSolverRunSnapshot;
};

// ---------------------------------------------------------------------------
// Server-backed CRUD — all admin-only active-tier users share the same history
// ---------------------------------------------------------------------------

export const listSavedSchedules = async (): Promise<SavedScheduleEntry[]> => {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/saved-schedules", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: SavedScheduleEntry[] };
    return (data.entries ?? []).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
};

export const saveScheduleToHistory = async (params: {
  name: string;
  scheduleDate: string;
  snapshot: LastSolverRunSnapshot;
}): Promise<SavedScheduleEntry> => {
  if (typeof window === "undefined") {
    throw new Error("Schedule history is only available in the browser.");
  }
  const res = await fetch("/api/saved-schedules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name.trim(),
      scheduleDate: params.scheduleDate,
      snapshot: params.snapshot,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { errors?: { message?: string }[] } | null;
    const msg = body?.errors?.[0]?.message ?? "Failed to save schedule.";
    throw new Error(msg);
  }
  const data = (await res.json()) as { entry: SavedScheduleEntry };
  return data.entry;
};

export const deleteSavedSchedule = async (id: string): Promise<void> => {
  if (typeof window === "undefined") return;
  await fetch(`/api/saved-schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
};

export const renameSavedSchedule = async (id: string, newName: string): Promise<void> => {
  if (typeof window === "undefined") return;
  await fetch(`/api/saved-schedules/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName }),
  });
};

// ---------------------------------------------------------------------------
// Browser-local helpers — these remain in localStorage (per-user calendar view)
// ---------------------------------------------------------------------------

export const loadSavedScheduleToCurrentView = (entry: SavedScheduleEntry): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    LAST_SOLVER_RUN_STORAGE_KEY,
    JSON.stringify({ ...entry.snapshot, name: entry.name }),
  );
  try {
    window.sessionStorage.setItem(VIEW_FROM_HISTORY_KEY, "1");
  } catch {
    // sessionStorage may be unavailable; history-protection is best-effort.
  }
};

export type ExportSavedScheduleResult =
  | { ok: true }
  | { ok: false; message: string; errors: ValidationError[]; detail: string };

export const exportSavedSchedule = async (
  entry: SavedScheduleEntry,
): Promise<ExportSavedScheduleResult> => {
  if (typeof window === "undefined") {
    return {
      ok: false,
      message: "Export is only available in the browser.",
      errors: [{ code: "export_failed", message: "Export is only available in the browser." }],
      detail: "",
    };
  }

  const safeDate = entry.scheduleDate.replace(/[^0-9-]/g, "") || "schedule";
  const safeName = entry.name.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "");

  try {
    const response = await fetch("/api/export-scheduling-spreadsheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: entry.snapshot.input, notes: [] }),
    });

    if (!response.ok) {
      let errors: ValidationError[] = [
        { code: "export_failed", message: "Could not export this saved schedule." },
      ];
      try {
        const payload = (await response.json()) as { errors?: ValidationError[] };
        if (Array.isArray(payload.errors) && payload.errors.length > 0) {
          errors = enrichSpreadsheetErrors(payload.errors, "export");
        } else {
          errors = enrichSpreadsheetErrors(
            [
              {
                code: "solver_response_invalid",
                message:
                  "The export service returned an unexpected response. Confirm the scheduling service is running and try again.",
                detail: `HTTP status ${response.status}`,
              },
            ],
            "export",
          );
        }
      } catch {
        errors = enrichSpreadsheetErrors(
          [
            {
              code: "solver_response_invalid",
              message:
                "The export service returned an unexpected response. Confirm the scheduling service is running and try again.",
              detail: `HTTP status ${response.status}`,
            },
          ],
          "export",
        );
      }
      return {
        ok: false,
        message: formatErrorsSummary(errors, "export"),
        errors,
        detail: formatErrorsDetail(errors, "export"),
      };
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
    return { ok: true };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Failed to reach export service.";
    const errors = enrichSpreadsheetErrors(
      [{ code: "network_error", message: normalizeNetworkError(raw, "export") }],
      "export",
    );
    return {
      ok: false,
      message: formatErrorsSummary(errors, "export"),
      errors,
      detail: formatErrorsDetail(errors, "export"),
    };
  }
};

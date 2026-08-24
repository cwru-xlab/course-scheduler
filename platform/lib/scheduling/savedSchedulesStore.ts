// Server-side saved-schedules store, scoped to a single Next.js server process.
// Persists to .data/saved-schedules.json — matches the shared-schedule.ts pattern.
// NOTE: if the app is horizontally scaled, replace this with a shared database.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import type { LastSolverRunSnapshot, SavedScheduleEntry } from "./history";

const DATA_DIR = join(process.cwd(), ".data");
const SCHEDULES_FILE = join(DATA_DIR, "saved-schedules.json");

const globalRef = globalThis as unknown as {
  __savedSchedules?: SavedScheduleEntry[];
};

function loadFromDisk(): SavedScheduleEntry[] {
  try {
    if (!existsSync(SCHEDULES_FILE)) return [];
    const raw = readFileSync(SCHEDULES_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedScheduleEntry => {
      if (!item || typeof item !== "object") return false;
      const c = item as Record<string, unknown>;
      return (
        typeof c.id === "string" &&
        typeof c.name === "string" &&
        typeof c.scheduleDate === "string" &&
        typeof c.savedAt === "string" &&
        typeof c.savedByUserId === "string" &&
        typeof c.savedByName === "string" &&
        !!c.snapshot &&
        typeof c.snapshot === "object"
      );
    });
  } catch {
    return [];
  }
}

function getState(): SavedScheduleEntry[] {
  if (globalRef.__savedSchedules === undefined) {
    globalRef.__savedSchedules = loadFromDisk();
  }
  return globalRef.__savedSchedules;
}

function persistToDisk(entries: SavedScheduleEntry[]) {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(SCHEDULES_FILE, JSON.stringify(entries), "utf8");
  } catch {
    /* ignore on read-only filesystems */
  }
}

export function listSavedSchedules(): SavedScheduleEntry[] {
  return [...getState()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveSavedSchedule(params: {
  name: string;
  scheduleDate: string;
  savedByUserId: string;
  savedByName: string;
  snapshot: LastSolverRunSnapshot;
}): SavedScheduleEntry {
  const entries = getState();
  const entry: SavedScheduleEntry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    name: params.name.trim(),
    scheduleDate: params.scheduleDate,
    savedAt: new Date().toISOString(),
    savedByUserId: params.savedByUserId,
    savedByName: params.savedByName,
    snapshot: params.snapshot,
  };
  const next = [entry, ...entries];
  globalRef.__savedSchedules = next;
  persistToDisk(next);
  return entry;
}

export function renameSavedSchedule(id: string, newName: string): SavedScheduleEntry | null {
  const trimmed = newName.trim();
  if (!trimmed) return null;
  const entries = getState();
  let renamed: SavedScheduleEntry | null = null;
  const next = entries.map((s) => {
    if (s.id !== id) return s;
    renamed = { ...s, name: trimmed };
    return renamed;
  });
  if (!renamed) return null;
  globalRef.__savedSchedules = next;
  persistToDisk(next);
  return renamed;
}

export function deleteSavedSchedule(id: string): boolean {
  const entries = getState();
  const next = entries.filter((s) => s.id !== id);
  if (next.length === entries.length) return false;
  globalRef.__savedSchedules = next;
  persistToDisk(next);
  return true;
}

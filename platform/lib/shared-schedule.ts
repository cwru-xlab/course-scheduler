// Shared "latest solver run" store, scoped to a single Next.js server process.
// Mirrors the solver-lock / activity-log pattern: in-memory on globalThis with
// best-effort JSON persistence under .data so the latest schedule survives a
// server restart. Not shared across replicas — if the app is scaled
// horizontally, back this with the solver DB or a shared cache.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import type { SchedulingDataRevision } from "@/lib/scheduling/dataRevision";
import type { SectionLockState } from "@/lib/scheduling/types";

/** Full snapshot needed for another user's calendar to reconstruct the view. */
export type SharedScheduleSnapshot = {
  input: unknown; // SchedulingInput
  solution: unknown; // ScheduleSolution
  lockedSectionIds: string[];
  /** Live lock state so the calendar can reconstruct soft/hard locks on apply. */
  sectionLocks?: Record<string, SectionLockState>;
  createdAt: string;
  /** Data revision in effect when this snapshot was created. */
  dataRevision?: SchedulingDataRevision;
};

export type SharedScheduleState = {
  /** Monotonic counter; bumped on every publish. 0 means "nothing published". */
  revision: number;
  ranBy: string | null;
  ranAt: number | null;
  snapshot: SharedScheduleSnapshot | null;
};

export type SharedScheduleMeta = Omit<SharedScheduleState, "snapshot">;

const globalRef = globalThis as unknown as {
  __sharedSchedule?: SharedScheduleState;
};

const DATA_DIR = join(process.cwd(), ".data");
const SCHEDULE_FILE = join(DATA_DIR, "latest-schedule.json");

const emptyState = (): SharedScheduleState => ({
  revision: 0,
  ranBy: null,
  ranAt: null,
  snapshot: null,
});

function loadFromDisk(): SharedScheduleState {
  try {
    if (!existsSync(SCHEDULE_FILE)) return emptyState();
    const raw = readFileSync(SCHEDULE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<SharedScheduleState>;
    if (!parsed || typeof parsed.revision !== "number") return emptyState();
    return {
      revision: parsed.revision,
      ranBy: parsed.ranBy ?? null,
      ranAt: parsed.ranAt ?? null,
      snapshot: parsed.snapshot ?? null,
    };
  } catch {
    return emptyState();
  }
}

function getState(): SharedScheduleState {
  if (!globalRef.__sharedSchedule) {
    globalRef.__sharedSchedule = loadFromDisk();
  }
  return globalRef.__sharedSchedule;
}

function persistToDisk(state: SharedScheduleState) {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(SCHEDULE_FILE, JSON.stringify(state), "utf8");
  } catch {
    /* ignore on read-only filesystems */
  }
}

/** Cheap metadata read for polling (no large snapshot payload). */
export function readSharedScheduleMeta(): SharedScheduleMeta {
  const state = getState();
  return { revision: state.revision, ranBy: state.ranBy, ranAt: state.ranAt };
}

/** Full read including the snapshot payload. */
export function readSharedSchedule(): SharedScheduleState {
  return { ...getState() };
}

export function publishSharedSchedule(input: {
  ranBy: string | null;
  snapshot: SharedScheduleSnapshot;
}): SharedScheduleMeta {
  const current = getState();
  const next: SharedScheduleState = {
    revision: current.revision + 1,
    ranBy: input.ranBy,
    ranAt: Date.now(),
    snapshot: input.snapshot,
  };
  globalRef.__sharedSchedule = next;
  persistToDisk(next);
  return { revision: next.revision, ranBy: next.ranBy, ranAt: next.ranAt };
}

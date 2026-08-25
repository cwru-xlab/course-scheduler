// Shared "latest solver run" store.
// Primary: solver DB via /sync/shared-schedule (works across Vercel replicas).
// Fallback: process-local globalThis + .data/ when sync endpoints are unavailable.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { fetchSolver } from "@/lib/api/solverFetch";
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

export type SharedScheduleMeta = Omit<SharedScheduleState, "snapshot"> & {
  dataRevision?: SchedulingDataRevision | null;
};

const globalRef = globalThis as unknown as {
  __sharedSchedule?: SharedScheduleState;
};

const DATA_DIR = join(process.cwd(), ".data");
const SCHEDULE_FILE = join(DATA_DIR, "latest-schedule.json");
const SYNC_TIMEOUT_MS = 12_000;

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

function getLocalState(): SharedScheduleState {
  if (!globalRef.__sharedSchedule) {
    globalRef.__sharedSchedule = loadFromDisk();
  }
  return globalRef.__sharedSchedule;
}

function persistLocal(state: SharedScheduleState) {
  globalRef.__sharedSchedule = state;
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(SCHEDULE_FILE, JSON.stringify(state), "utf8");
  } catch {
    /* ignore on read-only filesystems */
  }
}

function parseMeta(data: Record<string, unknown>): SharedScheduleMeta {
  return {
    revision: typeof data.revision === "number" ? data.revision : 0,
    ranBy: typeof data.ranBy === "string" ? data.ranBy : null,
    ranAt: typeof data.ranAt === "number" ? data.ranAt : null,
    dataRevision:
      data.dataRevision && typeof data.dataRevision === "object"
        ? (data.dataRevision as SchedulingDataRevision)
        : null,
  };
}

/** Cheap metadata read for polling (no large snapshot payload). */
export async function readSharedScheduleMeta(): Promise<SharedScheduleMeta> {
  try {
    const { response, data } = await fetchSolver(
      "/sync/shared-schedule",
      { method: "GET", cache: "no-store" },
      { timeoutMs: SYNC_TIMEOUT_MS },
    );
    if (response.ok) {
      return parseMeta(data as Record<string, unknown>);
    }
  } catch {
    /* fall through to local */
  }
  const local = getLocalState();
  return { revision: local.revision, ranBy: local.ranBy, ranAt: local.ranAt };
}

/** Full read including the snapshot payload. */
export async function readSharedSchedule(): Promise<SharedScheduleState> {
  try {
    const { response, data } = await fetchSolver(
      "/sync/shared-schedule?full=1",
      { method: "GET", cache: "no-store" },
      { timeoutMs: SYNC_TIMEOUT_MS },
    );
    if (response.ok) {
      const meta = parseMeta(data as Record<string, unknown>);
      const rawSnapshot =
        data.snapshot && typeof data.snapshot === "object"
          ? (data.snapshot as SharedScheduleSnapshot)
          : null;
      // Reject incomplete payloads so clients do not crash on .assignments.map.
      const snapshot =
        rawSnapshot &&
        rawSnapshot.solution &&
        typeof rawSnapshot.solution === "object" &&
        Array.isArray((rawSnapshot.solution as { assignments?: unknown }).assignments) &&
        rawSnapshot.input &&
        typeof rawSnapshot.input === "object" &&
        Array.isArray((rawSnapshot.input as { sections?: unknown }).sections)
          ? rawSnapshot
          : null;
      return {
        revision: meta.revision,
        ranBy: meta.ranBy,
        ranAt: meta.ranAt,
        snapshot,
      };
    }
  } catch {
    /* fall through to local */
  }
  return { ...getLocalState() };
}

export async function publishSharedSchedule(input: {
  ranBy: string | null;
  snapshot: SharedScheduleSnapshot;
}): Promise<SharedScheduleMeta> {
  try {
    const { response, data } = await fetchSolver(
      "/sync/shared-schedule",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ranBy: input.ranBy, snapshot: input.snapshot }),
      },
      { timeoutMs: SYNC_TIMEOUT_MS },
    );
    if (response.ok) {
      const meta = parseMeta(data as Record<string, unknown>);
      // Mirror locally so fallback reads stay coherent on this process.
      persistLocal({
        revision: meta.revision,
        ranBy: meta.ranBy,
        ranAt: meta.ranAt,
        snapshot: input.snapshot,
      });
      return meta;
    }
  } catch {
    /* fall through to local */
  }

  const current = getLocalState();
  const next: SharedScheduleState = {
    revision: current.revision + 1,
    ranBy: input.ranBy,
    ranAt: Date.now(),
    snapshot: input.snapshot,
  };
  persistLocal(next);
  return { revision: next.revision, ranBy: next.ranBy, ranAt: next.ranAt };
}

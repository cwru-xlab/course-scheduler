import type { SchedulingInput, SectionLockState } from "./types";
import type { LastSolverRunSnapshot } from "./history";
import { isValidLastSolverRunSnapshot } from "./history";
import { crosslistPeerSectionIds } from "./crosslist";
import {
  validatePreservedAssignment,
  type EditorInvalidatedPlacement,
} from "@/app/calendar/placementValidation";

export type { EditorInvalidatedPlacement, EditorInvalidationReason } from "@/app/calendar/placementValidation";

export const SCHEDULING_SNAPSHOT_MERGED_EVENT = "wsom-scheduling-snapshot-merged";
/** Session flag: calendar has unsaved placement edits vs baseline. */
export const CALENDAR_UNSAVED_PLACEMENTS_KEY = "wsom-calendar-unsaved-placements";
export const ORPHAN_PENDING_STORAGE_KEY = "wsom-pending-orphan-sections";
export const EDITOR_INVALIDATED_PLACEMENTS_KEY = "wsom-editor-invalidated-placements";

export type CalendarAssignmentEntry = {
  timeslot_ids: string[];
  room_id: string;
  meeting_pattern_id: string;
};

export type MergeEditorSnapshotResult = {
  snapshot: LastSolverRunSnapshot;
  orphanSectionIds: string[];
  editorInvalidatedPlacements: EditorInvalidatedPlacement[];
  keptGhostSectionIds: string[];
};

function buildAssignmentsMap(
  assignments: Array<{
    section_id: string;
    timeslot_ids: string[];
    room_id: string;
    meeting_pattern_id?: string;
  }>,
): Record<string, CalendarAssignmentEntry> {
  return Object.fromEntries(
    assignments.map((a) => [
      a.section_id,
      {
        timeslot_ids: [...(a.timeslot_ids ?? [])],
        room_id: a.room_id ?? "",
        meeting_pattern_id: a.meeting_pattern_id ?? "",
      },
    ]),
  );
}

export function readEditorInvalidatedPlacements(): EditorInvalidatedPlacement[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(EDITOR_INVALIDATED_PLACEMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is EditorInvalidatedPlacement =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as EditorInvalidatedPlacement).sectionId === "string" &&
        typeof (item as EditorInvalidatedPlacement).reason === "string" &&
        typeof (item as EditorInvalidatedPlacement).message === "string",
    );
  } catch {
    return [];
  }
}

export function writeEditorInvalidatedPlacements(
  placements: EditorInvalidatedPlacement[],
): void {
  if (typeof window === "undefined") return;
  if (!placements.length) {
    sessionStorage.removeItem(EDITOR_INVALIDATED_PLACEMENTS_KEY);
    return;
  }
  sessionStorage.setItem(EDITOR_INVALIDATED_PLACEMENTS_KEY, JSON.stringify(placements));
}

export function clearEditorInvalidation(sectionIds: string[]): void {
  if (typeof window === "undefined" || !sectionIds.length) return;
  const remove = new Set(sectionIds);
  const next = readEditorInvalidatedPlacements().filter((p) => !remove.has(p.sectionId));
  writeEditorInvalidatedPlacements(next);
}

export function editorInvalidatedPlacementsToMap(
  placements: EditorInvalidatedPlacement[],
): Map<string, EditorInvalidatedPlacement> {
  return new Map(placements.map((p) => [p.sectionId, p]));
}

/**
 * Merge fresh editor metadata into an existing solver-run snapshot while
 * preserving placements where still valid.
 */
export function mergeEditorIntoSnapshot(
  existing: LastSolverRunSnapshot | null,
  freshInput: SchedulingInput,
  options?: {
    /** Orphans the user chose to keep on calendar (ghost sections). */
    keepOrphanIds?: Set<string>;
    dataRevision?: LastSolverRunSnapshot["dataRevision"];
  },
): MergeEditorSnapshotResult {
  const freshById = new Map(freshInput.sections.map((s) => [s.id, s]));
  const prevSectionById = new Map(
    (existing?.input.sections ?? []).map((section) => [section.id, section]),
  );
  const keepOrphans = options?.keepOrphanIds ?? new Set<string>();

  const prevAssignments = existing?.solution?.assignments ?? [];
  const prevAssignmentMap = buildAssignmentsMap(prevAssignments);
  const prevLocks = { ...(existing?.sectionLocks ?? {}) };

  const nextAssignments: Record<string, CalendarAssignmentEntry> = {};
  const orphanSectionIds: string[] = [];
  const editorInvalidatedPlacements: EditorInvalidatedPlacement[] = [];
  const keptGhostSectionIds: string[] = [];

  for (const [sectionId, entry] of Object.entries(prevAssignmentMap)) {
    const fresh = freshById.get(sectionId);
    if (!fresh) {
      if (keepOrphans.has(sectionId)) {
        nextAssignments[sectionId] = { ...entry };
        keptGhostSectionIds.push(sectionId);
      } else {
        orphanSectionIds.push(sectionId);
      }
      continue;
    }

    const prevSection = prevSectionById.get(sectionId);
    const linkedSectionIds = crosslistPeerSectionIds(sectionId, freshInput.sections);
    const validation = validatePreservedAssignment({
      section: fresh,
      prevSection,
      linkedSectionIds,
      allSections: freshInput.sections,
      assignment: entry,
      rooms: freshInput.rooms,
    });

    if (!validation.valid) {
      editorInvalidatedPlacements.push({
        sectionId,
        reason: validation.reason,
        message: validation.message,
      });
      continue;
    }

    nextAssignments[sectionId] = { ...entry };
  }

  for (const section of freshInput.sections) {
    if (nextAssignments[section.id]) continue;
    // New sections start unplaced (queue).
    void section;
  }

  const solutionAssignments = Object.entries(nextAssignments).map(([section_id, value]) => ({
    section_id,
    timeslot_ids: value.timeslot_ids,
    room_id: value.room_id,
    meeting_pattern_id: value.meeting_pattern_id,
  }));

  const snapshot: LastSolverRunSnapshot = {
    input: freshInput,
    solution: {
      assignments: solutionAssignments,
      total_score: existing?.solution?.total_score ?? 0,
      penalty_breakdown: existing?.solution?.penalty_breakdown ?? {},
      explanations: existing?.solution?.explanations ?? [],
    },
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    sectionLocks: Object.fromEntries(
      Object.entries(prevLocks).filter(([id]) => freshById.has(id) || keepOrphans.has(id)),
    ) as Record<string, SectionLockState>,
    dataRevision: options?.dataRevision ?? existing?.dataRevision,
    name: existing?.name,
  };

  return {
    snapshot,
    orphanSectionIds,
    editorInvalidatedPlacements,
    keptGhostSectionIds,
  };
}

export function readLastSolverRunSnapshot(): LastSolverRunSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("wsom-last-solver-run");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidLastSolverRunSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLastSolverRunSnapshot(
  snapshot: LastSolverRunSnapshot,
  meta?: {
    editorInvalidatedPlacements?: EditorInvalidatedPlacement[];
    orphanSectionIds?: string[];
  },
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("wsom-last-solver-run", JSON.stringify(snapshot));
  window.dispatchEvent(
    new CustomEvent(SCHEDULING_SNAPSHOT_MERGED_EVENT, {
      detail: {
        editorInvalidatedPlacements: meta?.editorInvalidatedPlacements ?? [],
        orphanSectionIds: meta?.orphanSectionIds ?? [],
      },
    }),
  );
}

export function setCalendarUnsavedPlacementsFlag(hasUnsaved: boolean): void {
  if (typeof window === "undefined") return;
  if (hasUnsaved) {
    sessionStorage.setItem(CALENDAR_UNSAVED_PLACEMENTS_KEY, "1");
  } else {
    sessionStorage.removeItem(CALENDAR_UNSAVED_PLACEMENTS_KEY);
  }
}

export function calendarHasUnsavedPlacements(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(CALENDAR_UNSAVED_PLACEMENTS_KEY) === "1";
}

export async function publishSnapshotToSharedSchedule(
  snapshot: LastSolverRunSnapshot,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch("/api/shared-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * After editor save: merge fresh input into calendar snapshot and publish.
 * Returns orphan ids needing user resolution when no snapshot existed before.
 */
export async function mergeEditorSaveIntoCalendar(
  freshInput: SchedulingInput,
  dataRevision?: LastSolverRunSnapshot["dataRevision"],
): Promise<{
  merged: boolean;
  orphanSectionIds: string[];
  editorInvalidatedPlacements: EditorInvalidatedPlacement[];
}> {
  if (typeof window === "undefined") {
    return { merged: false, orphanSectionIds: [], editorInvalidatedPlacements: [] };
  }

  if (calendarHasUnsavedPlacements()) {
    const proceed = window.confirm(
      "Apply editor changes to the calendar? Unsaved calendar placements will be preserved where still valid.",
    );
    if (!proceed) {
      return { merged: false, orphanSectionIds: [], editorInvalidatedPlacements: [] };
    }
  }

  const existing = readLastSolverRunSnapshot();
  if (!existing) {
    // No solver snapshot to merge into — avoid publishing an empty schedule.
    return { merged: false, orphanSectionIds: [], editorInvalidatedPlacements: [] };
  }

  const { snapshot, orphanSectionIds, editorInvalidatedPlacements } = mergeEditorIntoSnapshot(
    existing,
    freshInput,
    { dataRevision },
  );

  const prevPlacedCount = (existing.solution?.assignments ?? []).filter(
    (a) => (a.timeslot_ids?.length ?? 0) > 0 && String(a.room_id ?? "").trim(),
  ).length;
  const nextPlacedCount = snapshot.solution.assignments.filter(
    (a) => (a.timeslot_ids?.length ?? 0) > 0 && String(a.room_id ?? "").trim(),
  ).length;
  if (prevPlacedCount > 0 && nextPlacedCount === 0) {
    console.warn(
      "[mergeEditorSaveIntoCalendar] Skipping publish: merge would remove all placements.",
    );
    return { merged: false, orphanSectionIds: [], editorInvalidatedPlacements: [] };
  }

  writeEditorInvalidatedPlacements(editorInvalidatedPlacements);
  writeLastSolverRunSnapshot(snapshot, { editorInvalidatedPlacements, orphanSectionIds });
  if (orphanSectionIds.length) {
    const orphanSections =
      existing?.input.sections.filter((s) => orphanSectionIds.includes(s.id)) ?? [];
    sessionStorage.setItem(ORPHAN_PENDING_STORAGE_KEY, JSON.stringify(orphanSections));
  } else {
    sessionStorage.removeItem(ORPHAN_PENDING_STORAGE_KEY);
  }
  await publishSnapshotToSharedSchedule(snapshot);

  return {
    merged: true,
    orphanSectionIds,
    editorInvalidatedPlacements,
  };
}

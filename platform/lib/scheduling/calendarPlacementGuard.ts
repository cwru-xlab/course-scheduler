import { readLastSolverRunSnapshot } from "./mergeEditorIntoSnapshot";
import { isOnlineSection } from "./sectionOnline";
import type { SchedulingInput } from "./types";

export const EDITOR_ARCHIVED_WHILE_SCHEDULED_TAG = "__editor_archived__";

function isPlacedAssignment(
  sectionId: string,
  assignment: { timeslot_ids?: string[]; room_id?: string },
  sections: SchedulingInput["sections"],
): boolean {
  if ((assignment.timeslot_ids?.length ?? 0) === 0) return false;
  const section = sections.find((entry) => entry.id === sectionId);
  if (section && isOnlineSection(section)) {
    return true;
  }
  return String(assignment.room_id ?? "").trim().length > 0;
}

export function getCalendarPlacedSectionIds(
  snapshot = readLastSolverRunSnapshot(),
): Set<string> {
  const placed = new Set<string>();
  if (!snapshot) return placed;
  const sections = snapshot.input.sections ?? [];
  for (const assignment of snapshot.solution?.assignments ?? []) {
    if (isPlacedAssignment(assignment.section_id, assignment, sections)) {
      placed.add(assignment.section_id);
    }
  }
  return placed;
}

export function isSectionPlacedOnCalendar(
  sectionId: string,
  snapshot = readLastSolverRunSnapshot(),
): boolean {
  return getCalendarPlacedSectionIds(snapshot).has(sectionId);
}

export function tagSectionArchivedFromEditor<T extends { tags?: string[] }>(section: T): T {
  const tags = Array.from(new Set([...(section.tags ?? []), EDITOR_ARCHIVED_WHILE_SCHEDULED_TAG]));
  return { ...section, tags };
}

export function sectionArchivedFromEditor(section: { tags?: string[] }): boolean {
  return (section.tags ?? []).includes(EDITOR_ARCHIVED_WHILE_SCHEDULED_TAG);
}

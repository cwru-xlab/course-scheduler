import type { Section } from "./types";
import { normalizeSectionState } from "./sectionState";
import { normalizeAssignedHalf, normalizeSectionTerm } from "./sectionTerm";

/** Normalize section fields before persisting from calendar or merge paths. */
export function normalizeSectionForSave(section: Section): Section {
  return {
    ...section,
    id: String(section.id ?? "").trim(),
    course_id: String(section.course_id ?? "").trim(),
    department: String(section.department ?? "").trim(),
    section_code: String(section.section_code ?? "").trim(),
    section_number: String(section.section_number ?? "").trim(),
    instructor_id: String(section.instructor_id ?? "").trim(),
    state: normalizeSectionState(section.state),
    term: normalizeSectionTerm(section.term),
    assigned_half:
      normalizeSectionTerm(section.term) === "half_any"
        ? normalizeAssignedHalf(section.assigned_half)
        : null,
    allowed_meeting_patterns: [...(section.allowed_meeting_patterns ?? [])],
    room_requirements: [...(section.room_requirements ?? [])],
    tags: [...(section.tags ?? [])],
    crosslist_group_id: section.crosslist_group_id?.trim() || null,
  };
}

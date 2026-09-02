import type { Section } from "./types";
import { normalizeSectionState } from "./sectionState";
import {
  normalizeAssignedHalf,
  normalizeSemesterLength,
} from "./semesterLength";

/** Normalize section fields before persisting from calendar or merge paths. */
export function normalizeSectionForSave(section: Section): Section {
  const semester_length = normalizeSemesterLength(section.semester_length);
  return {
    ...section,
    id: String(section.id ?? "").trim(),
    course_id: String(section.course_id ?? "").trim(),
    department: String(section.department ?? "").trim(),
    section_code: String(section.section_code ?? "").trim(),
    section_number: String(section.section_number ?? "").trim(),
    instructor_id: String(section.instructor_id ?? "").trim(),
    state: normalizeSectionState(section.state),
    semester_length,
    assigned_half:
      semester_length === "half_any" ? normalizeAssignedHalf(section.assigned_half) : null,
    allowed_meeting_patterns: [...(section.allowed_meeting_patterns ?? [])],
    room_requirements: [...(section.room_requirements ?? [])],
    tags: [...(section.tags ?? [])],
    crosslist_group_id: section.crosslist_group_id?.trim() || null,
  };
}

/** Online sections use registrar section_number in 800–899 (import source of truth). */
export function isOnlineSection(section: { section_number?: string | null }): boolean {
  const raw = String(section.section_number ?? "").trim();
  if (!raw || !/^\d+$/.test(raw)) return false;
  const n = Number.parseInt(raw, 10);
  return n >= 800 && n <= 899;
}

export type PlacementSectionFields = {
  room_id?: string | null;
  timeslot_id?: string | null;
  previous_meeting_pattern?: string | null;
  section_number?: string | null;
};

export type PlacementAssignmentFields = {
  room_id?: string;
  timeslot_ids?: string[];
  meeting_pattern_id?: string;
};

export function isAssignmentEmpty(
  assignment?: PlacementAssignmentFields | null,
): boolean {
  if (!assignment) return true;
  const roomId = String(assignment.room_id ?? "").trim();
  const timeslots = (assignment.timeslot_ids ?? []).filter(Boolean);
  return !roomId && timeslots.length === 0;
}

/** Merge assignment map, solver timeslots, and persisted section fields (same as calendar grid). */
export function resolveEffectiveAssignment(
  section: PlacementSectionFields,
  assignment?: PlacementAssignmentFields | null,
  solverTimeslotIds?: string[] | null,
): { room_id: string; timeslot_ids: string[]; meeting_pattern_id: string } {
  if (assignment && isAssignmentEmpty(assignment)) {
    return {
      room_id: "",
      timeslot_ids: [],
      meeting_pattern_id: String(
        assignment.meeting_pattern_id ?? section.previous_meeting_pattern ?? "",
      ).trim(),
    };
  }
  const fromMapTimeslots = (assignment?.timeslot_ids ?? []).filter(Boolean);
  const fromSolverTimeslots = (solverTimeslotIds ?? []).filter(Boolean);
  const timeslot_ids =
    fromMapTimeslots.length > 0
      ? fromMapTimeslots
      : fromSolverTimeslots.length > 0
        ? fromSolverTimeslots
        : section.timeslot_id
          ? [section.timeslot_id]
          : [];

  const fromMapRoom = String(assignment?.room_id ?? "").trim();
  const room_id = fromMapRoom || String(section.room_id ?? "").trim();

  const meeting_pattern_id = String(
    assignment?.meeting_pattern_id ?? section.previous_meeting_pattern ?? "",
  ).trim();

  return { room_id, timeslot_ids, meeting_pattern_id };
}

export function isSectionScheduled(
  section: PlacementSectionFields,
  assignment?: PlacementAssignmentFields | null,
  solverTimeslotIds?: string[] | null,
): boolean {
  const resolved = resolveEffectiveAssignment(section, assignment, solverTimeslotIds);
  if (isOnlineSection(section)) {
    return resolved.timeslot_ids.length > 0;
  }
  return Boolean(resolved.room_id) && resolved.timeslot_ids.length > 0;
}

/** Queue = existing section missing room and/or timeslot (online uses time-only band). */
export function isQueuedSection(
  section: PlacementSectionFields,
  assignment?: PlacementAssignmentFields | null,
  solverTimeslotIds?: string[] | null,
): boolean {
  return !isSectionScheduled(section, assignment, solverTimeslotIds);
}

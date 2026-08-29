/** Online sections use registrar section_number in 800–899 (import source of truth). */
export function isOnlineSection(section: { section_number?: string | null }): boolean {
  const raw = String(section.section_number ?? "").trim();
  if (!raw || !/^\d+$/.test(raw)) return false;
  const n = Number.parseInt(raw, 10);
  return n >= 800 && n <= 899;
}

/** Solver sentinel room id for online sections — never a physical room. */
export const ONLINE_ROOM_SENTINEL = "__ONLINE__";

export function isSolverOnlineRoomId(roomId?: string | null): boolean {
  return String(roomId ?? "").trim() === ONLINE_ROOM_SENTINEL;
}

/** Map solver/calendar room_id to persisted assignment room_id for a section. */
export function normalizeAssignmentRoomId(
  section: { section_number?: string | null },
  roomId?: string | null,
): string {
  if (isOnlineSection(section)) {
    return "";
  }
  return String(roomId ?? "").trim();
}

export type PatternFilterSectionFields = {
  allowed_meeting_patterns?: string[] | null;
  previous_meeting_pattern?: string | null;
  assignment?: { meeting_pattern_id?: string } | null;
};

/** Primary pattern label for queue sort/filter (first allowed, else persisted). */
export function primaryPatternForSection(section: PatternFilterSectionFields): string {
  const allowed = (section.allowed_meeting_patterns ?? []).map((p) => String(p).trim()).filter(Boolean);
  if (allowed.length > 0) return allowed[0];
  const fromAssignment = String(section.assignment?.meeting_pattern_id ?? "").trim();
  if (fromAssignment) return fromAssignment;
  return String(section.previous_meeting_pattern ?? "").trim() || "—";
}

export function sectionMatchesPatternFilter(
  section: PatternFilterSectionFields,
  patternId: string,
): boolean {
  const needle = patternId.trim();
  if (!needle) return true;
  if ((section.allowed_meeting_patterns ?? []).includes(needle)) return true;
  if (String(section.previous_meeting_pattern ?? "").trim() === needle) return true;
  if (String(section.assignment?.meeting_pattern_id ?? "").trim() === needle) return true;
  return false;
}

export type PlacementSectionFields = {
  room_id?: string | null;
  timeslot_id?: string | null;
  timeslot_ids?: string[] | null;
  previous_meeting_pattern?: string | null;
  section_number?: string | null;
};

/** Timeslot IDs stored on a section row (prefers full array, falls back to legacy single FK). */
export function persistedSectionTimeslotIds(section: {
  timeslot_ids?: string[] | null;
  timeslot_id?: string | null;
}): string[] {
  const fromList = (section.timeslot_ids ?? []).map((id) => String(id).trim()).filter(Boolean);
  if (fromList.length > 0) return fromList;
  const single = String(section.timeslot_id ?? "").trim();
  return single ? [single] : [];
}

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
  if (!assignment) {
    const fromSolverTimeslots = (solverTimeslotIds ?? []).filter(Boolean);
    return {
      room_id: "",
      timeslot_ids: fromSolverTimeslots,
      meeting_pattern_id: String(section.previous_meeting_pattern ?? "").trim(),
    };
  }
  if (isAssignmentEmpty(assignment)) {
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
  const fromSectionTimeslots = persistedSectionTimeslotIds(section);
  const timeslot_ids =
    fromMapTimeslots.length > 0
      ? fromMapTimeslots
      : fromSolverTimeslots.length > 0
        ? fromSolverTimeslots
        : fromSectionTimeslots;

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

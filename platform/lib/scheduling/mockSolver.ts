import type {
  CrossListGroup,
  LockedAssignment,
  MeetingPattern,
  Room,
  ScheduleAssignment,
  ScheduleSolution,
  SchedulingInput,
  SolverResult,
  ValidationError,
} from "./types";

const ROOM_WASTE_WEIGHT = 0.25;
const INSTRUCTOR_PREF_WEIGHT = 5;
const ADJUNCT_DAYS_WEIGHT = 10;

const buildRoomMap = (rooms: Room[]) =>
  new Map(rooms.map((room) => [room.id, room]));

const buildMeetingPatternMap = (patterns: MeetingPattern[]) =>
  new Map(patterns.map((pattern) => [pattern.id, pattern]));

const buildLockMap = (locks: LockedAssignment[]) =>
  new Map(locks.map((lock) => [lock.section_id, lock]));

const makeError = (code: string, message: string): ValidationError => ({
  code,
  message,
});

const hasRequiredFeatures = (room: Room, required: string[]) =>
  required.every((feature) => room.features.includes(feature));

const computeRoomWastePenalty = (room: Room, enrollment: number) =>
  Math.max(0, room.capacity - enrollment) * ROOM_WASTE_WEIGHT;

const computeInstructorPreferencePenalty = (
  instructorPreferredDays: string[],
  timeslotDays: string[],
) =>
  timeslotDays.some((day) => instructorPreferredDays.includes(day))
    ? 0
    : INSTRUCTOR_PREF_WEIGHT;

const computeAdjunctDaysPenalty = (rankType: string, days: string[]) =>
  rankType === "Adjunct" && new Set(days).size > 2 ? ADJUNCT_DAYS_WEIGHT : 0;

const getTimeslotDays = (timeslotIds: string[], timeslots: SchedulingInput["timeslots"]) => {
  const timeslotMap = new Map(timeslots.map((slot) => [slot.id, slot.day]));
  return timeslotIds.map((id) => timeslotMap.get(id)).filter(Boolean) as string[];
};

const pickFirstCompatibleSet = (
  pattern: MeetingPattern,
  blockedTimes: Set<string>,
  instructorUnavailable: Set<string>,
) => {
  return pattern.compatible_timeslot_sets.find((set) =>
    set.every(
      (slot) => !blockedTimes.has(slot) && !instructorUnavailable.has(slot),
    ),
  );
};

const validateCrossListCapacity = (
  crosslists: CrossListGroup[],
  sections: SchedulingInput["sections"],
  rooms: SchedulingInput["rooms"],
): ValidationError[] => {
  const roomCaps = rooms.map((room) => room.capacity);
  const errors: ValidationError[] = [];

  crosslists.forEach((group) => {
    const members = sections.filter((section) =>
      group.member_section_ids.includes(section.id),
    );
    const totalEnrollment = members.reduce(
      (sum, section) => sum + section.expected_enrollment,
      0,
    );
    const maxRoomCapacity = Math.max(...roomCaps);
    if (totalEnrollment > maxRoomCapacity) {
      errors.push(
        makeError(
          "crosslist_capacity",
          `Cross-list group ${group.id} requires capacity ${totalEnrollment}, but max room is ${maxRoomCapacity}.`,
        ),
      );
    }
  });

  return errors;
};

const validateSectionRooms = (input: SchedulingInput): ValidationError[] => {
  const errors: ValidationError[] = [];
  input.sections.forEach((section) => {
    const eligibleRooms = input.rooms.filter(
      (room) =>
        room.capacity >= section.expected_enrollment &&
        hasRequiredFeatures(room, section.room_requirements),
    );
    if (eligibleRooms.length === 0) {
      errors.push(
        makeError(
          "no_feasible_room",
          `Section ${section.id} has no room that meets capacity/features.`,
        ),
      );
    }
  });
  return errors;
};

export const runMockSolver = (input: SchedulingInput): SolverResult => {
  const errors: ValidationError[] = [];
  errors.push(...validateCrossListCapacity(input.crosslist_groups, input.sections, input.rooms));
  errors.push(...validateSectionRooms(input));

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const roomMap = buildRoomMap(input.rooms);
  const patternMap = buildMeetingPatternMap(input.meeting_patterns);
  const lockMap = buildLockMap(input.locked_assignments);
  const blockedTimes = new Set(input.blocked_times.flatMap((b) => b.timeslot_ids));

  const assignments: ScheduleAssignment[] = [];
  const explanations: string[] = [];
  const penaltyBreakdown: Record<string, number> = {
    instructor_preferences: 0,
    room_waste: 0,
    adjunct_days: 0,
  };

  const crosslistAssignments = new Map<string, ScheduleAssignment>();
  const usedRoomTimes = new Map<string, Set<string>>();

  input.sections.forEach((section) => {
    const instructor = input.instructors.find(
      (inst) => inst.id === section.instructor_id,
    );
    const instructorUnavailable = new Set(instructor?.unavailable_times ?? []);
    const lock = lockMap.get(section.id);

    if (section.crosslist_group_id) {
      const existing = crosslistAssignments.get(section.crosslist_group_id);
      if (existing) {
        const room = roomMap.get(existing.room_id)!;
        assignments.push({
          section_id: section.id,
          meeting_pattern_id: existing.meeting_pattern_id,
          timeslot_ids: existing.timeslot_ids,
          room_id: room.id,
        });
        explanations.push(
          `Section ${section.id} shares time with cross-list group ${section.crosslist_group_id}.`,
        );
        return;
      }
    }

    const allowedPatterns = section.allowed_meeting_patterns
      .map((id) => patternMap.get(id))
      .filter(Boolean) as MeetingPattern[];
    const pattern = lock?.fixed_timeslot_set
      ? allowedPatterns.find((p) =>
          p.compatible_timeslot_sets.some(
            (set) =>
              set.length === lock.fixed_timeslot_set?.length &&
              set.every((slot) => lock.fixed_timeslot_set?.includes(slot)),
          ),
        ) ?? allowedPatterns[0]
      : allowedPatterns[0];

    const timeslotSet =
      lock?.fixed_timeslot_set ??
      pickFirstCompatibleSet(pattern, blockedTimes, instructorUnavailable);
    if (!timeslotSet) {
      errors.push(
        makeError(
          "no_feasible_timeslot",
          `Section ${section.id} has no feasible timeslot set.`,
        ),
      );
      return;
    }

    const eligibleRooms = input.rooms.filter(
      (room) =>
        room.capacity >= section.expected_enrollment &&
        hasRequiredFeatures(room, section.room_requirements),
    );
    const room = lock?.fixed_room
      ? roomMap.get(lock.fixed_room)
      : eligibleRooms[0];
    if (!room) {
      errors.push(
        makeError(
          "no_feasible_room",
          `Section ${section.id} has no feasible room after locks.`,
        ),
      );
      return;
    }

    const roomSchedule = usedRoomTimes.get(room.id) ?? new Set();
    const overlap = timeslotSet.some((slot) => roomSchedule.has(slot));
    if (overlap) {
      errors.push(
        makeError(
          "room_overlap",
          `Room ${room.id} already booked for ${timeslotSet.join(", ")}.`,
        ),
      );
      return;
    }
    timeslotSet.forEach((slot) => roomSchedule.add(slot));
    usedRoomTimes.set(room.id, roomSchedule);

    const assignment: ScheduleAssignment = {
      section_id: section.id,
      meeting_pattern_id: pattern.id,
      timeslot_ids: timeslotSet,
      room_id: room.id,
    };
    assignments.push(assignment);

    if (section.crosslist_group_id) {
      crosslistAssignments.set(section.crosslist_group_id, assignment);
    }

    const timeslotDays = getTimeslotDays(timeslotSet, input.timeslots);
    const prefPenalty = computeInstructorPreferencePenalty(
      instructor?.preferences.preferred_days ?? [],
      timeslotDays,
    );
    const wastePenalty = computeRoomWastePenalty(
      room,
      section.expected_enrollment,
    );
    const adjunctPenalty = computeAdjunctDaysPenalty(
      instructor?.rank_type ?? "",
      timeslotDays,
    );
    penaltyBreakdown.instructor_preferences += prefPenalty;
    penaltyBreakdown.room_waste += wastePenalty;
    penaltyBreakdown.adjunct_days += adjunctPenalty;

    explanations.push(
      `Section ${section.id} scheduled in ${room.id} (${timeslotSet.join(", ")}) using ${pattern.id}.`,
    );
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const totalScore =
    penaltyBreakdown.instructor_preferences +
    penaltyBreakdown.room_waste +
    penaltyBreakdown.adjunct_days;

  const solution: ScheduleSolution = {
    assignments,
    total_score: totalScore,
    penalty_breakdown: penaltyBreakdown,
    explanations,
  };

  return { ok: true, solution };
};

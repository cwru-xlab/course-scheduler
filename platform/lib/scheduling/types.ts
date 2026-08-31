export type Id = string;

export type SectionState = "active" | "archived" | "new";

export type SemesterLength = "full" | "half_any" | "first_half" | "second_half";

export type Section = {
  id: Id;
  course_id: Id;
  /** Department code or name; used for calendar color-coding */
  department?: string;
  section_code: string;
  section_number: string;
  instructor_id: Id;
  expected_enrollment: number;
  enrollment_cap: number;
  allowed_meeting_patterns: Id[];
  room_requirements: string[];
  crosslist_group_id?: Id | null;
  tags: string[];
  previous_meeting_pattern?: Id;
  /** active/new = schedule & show on calendar; archived = excluded from solver & calendar */
  state?: SectionState;
  /** Full semester vs first/second half (or either half). Defaults to full. */
  semester_length?: SemesterLength;
};

export type Instructor = {
  id: Id;
  name: string;
  rank_type: "TT" | "Tenured" | "NTT" | "Adjunct";
  unavailable_times: Id[];
  preferences: {
    preferred_days: string[];
    preferred_patterns: Id[];
    max_teaching_days?: number;
  };
};

export type Room = {
  id: Id;
  building: string;
  room_number: string;
  capacity: number;
  features: string[];
};

export type Timeslot = {
  id: Id;
  day: string;
  start_time: string;
  end_time: string;
  /**
   * Timeslot "block type" classification used by the solver (stored as `slot_type`).
   * Frontend maps "Short block" -> `standard` and "Long block" -> `evening`.
   */
  slot_type?: string;
};

export type MeetingPattern = {
  id: Id;
  slots_required: number;
  allowed_days: string[];
  compatible_timeslot_sets: Id[][];
};

export type CrossListGroup = {
  id: Id;
  member_section_ids: Id[];
};

export type NoOverlapGroup = {
  id: Id;
  member_section_ids: Id[];
  reason: string;
};

export type BlockedTime = {
  scope: "global" | "instructor" | "room" | "program";
  days: string;
  start_time: string;
  end_time: string;
  instructor_id?: Id;
  room_id?: Id;
  // Legacy fallback support for imported data.
  timeslot_ids?: Id[];
  reason: string;
};

export type LockedAssignment = {
  section_id: Id;
  fixed_timeslot_set?: Id[];
  fixed_room?: Id;
};

export type SoftLock = {
  section_id: Id;
  preferred_timeslot_set?: Id[];
  preferred_room?: Id;
  weight: number; // Higher = stronger preference (e.g., 1-100)
};

export type SectionLockState = "none" | "soft" | "hard";

export type SectionLocksMap = Record<string, SectionLockState>;

export const DEFAULT_SOFT_WEIGHT = 20;

export type ScheduleAssignment = {
  section_id: Id;
  meeting_pattern_id: Id;
  timeslot_ids: Id[];
  room_id: Id;
};

export type PenaltyBreakdown = Record<string, number>;

export type ScheduleSolution = {
  assignments: ScheduleAssignment[];
  total_score: number;
  penalty_breakdown: PenaltyBreakdown;
  explanations: string[];
};

export type ValidationError = {
  code: string;
  message: string;
  /** Raw technical text for developers — not shown by default in the UI. */
  detail?: string;
  sheet?: string;
  row_id?: string;
  field?: string;
};

export type SchedulingInput = {
  sections: Section[];
  instructors: Instructor[];
  rooms: Room[];
  timeslots: Timeslot[];
  meeting_patterns: MeetingPattern[];
  crosslist_groups: CrossListGroup[];
  no_overlap_groups: NoOverlapGroup[];
  blocked_times: BlockedTime[];
  locked_assignments: LockedAssignment[];
  soft_locks: SoftLock[];
};

export type SolverResult =
  | { ok: true; solution: ScheduleSolution }
  | { ok: false; errors: ValidationError[] };

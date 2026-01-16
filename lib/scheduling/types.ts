export type Id = string;

export type Section = {
  id: Id;
  course_id: Id;
  section_code: string;
  instructor_id: Id;
  expected_enrollment: number;
  enrollment_cap: number;
  allowed_meeting_patterns: Id[];
  room_requirements: string[];
  crosslist_group_id?: Id | null;
  tags: string[];
};

export type Instructor = {
  id: Id;
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
  capacity: number;
  features: string[];
};

export type Timeslot = {
  id: Id;
  day: string;
  start_time: string;
  end_time: string;
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
  require_same_room: boolean;
};

export type NoOverlapGroup = {
  id: Id;
  member_section_ids: Id[];
  reason: string;
};

export type BlockedTime = {
  scope: "global" | "instructor" | "room" | "program";
  timeslot_ids: Id[];
  reason: string;
};

export type LockedAssignment = {
  section_id: Id;
  fixed_timeslot_set?: Id[];
  fixed_room?: Id;
};

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
};

export type SolverResult =
  | { ok: true; solution: ScheduleSolution }
  | { ok: false; errors: ValidationError[] };

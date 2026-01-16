import type { SchedulingInput } from "./types";

export const mockSchedulingInput: SchedulingInput = {
  sections: [
    {
      id: "SEC-101-A",
      course_id: "COURSE-101",
      section_code: "A",
      instructor_id: "INST-ALPHA",
      expected_enrollment: 28,
      enrollment_cap: 30,
      allowed_meeting_patterns: ["MP-MW-60", "MP-TR-75"],
      room_requirements: ["projector"],
      crosslist_group_id: "CLG-1",
      tags: ["core_required"],
    },
    {
      id: "SEC-101-B",
      course_id: "COURSE-101",
      section_code: "B",
      instructor_id: "INST-BETA",
      expected_enrollment: 25,
      enrollment_cap: 28,
      allowed_meeting_patterns: ["MP-MW-60", "MP-TR-75"],
      room_requirements: ["projector"],
      crosslist_group_id: null,
      tags: ["core_required"],
    },
    {
      id: "SEC-550-A",
      course_id: "COURSE-550",
      section_code: "A",
      instructor_id: "INST-GAMMA",
      expected_enrollment: 35,
      enrollment_cap: 40,
      allowed_meeting_patterns: ["MP-TR-75"],
      room_requirements: ["case_room"],
      crosslist_group_id: "CLG-1",
      tags: ["upper_level_required"],
    },
    {
      id: "SEC-620-A",
      course_id: "COURSE-620",
      section_code: "A",
      instructor_id: "INST-DELTA",
      expected_enrollment: 18,
      enrollment_cap: 20,
      allowed_meeting_patterns: ["MP-MW-60"],
      room_requirements: [],
      crosslist_group_id: null,
      tags: ["elective"],
    },
  ],
  instructors: [
    {
      id: "INST-ALPHA",
      rank_type: "Tenured",
      unavailable_times: ["TS-M-0900", "TS-W-0900"],
      preferences: {
        preferred_days: ["Tue", "Thu"],
        preferred_patterns: ["MP-TR-75"],
        max_teaching_days: 3,
      },
    },
    {
      id: "INST-BETA",
      rank_type: "Adjunct",
      unavailable_times: ["TS-T-0900"],
      preferences: {
        preferred_days: ["Mon", "Wed"],
        preferred_patterns: ["MP-MW-60"],
        max_teaching_days: 2,
      },
    },
    {
      id: "INST-GAMMA",
      rank_type: "TT",
      unavailable_times: [],
      preferences: {
        preferred_days: ["Tue", "Thu"],
        preferred_patterns: ["MP-TR-75"],
      },
    },
    {
      id: "INST-DELTA",
      rank_type: "NTT",
      unavailable_times: ["TS-M-1030"],
      preferences: {
        preferred_days: ["Mon", "Wed"],
        preferred_patterns: ["MP-MW-60"],
      },
    },
  ],
  rooms: [
    {
      id: "ROOM-A",
      building: "Peters",
      capacity: 63,
      features: ["projector", "case_room"],
    },
    {
      id: "ROOM-B",
      building: "Peters",
      capacity: 63,
      features: ["projector", "case_room"],
    },
    {
      id: "ROOM-C",
      building: "Smith",
      capacity: 63,
      features: ["projector", "case_room"],
    },
  ],
  timeslots: [
    { id: "TS-M-0900", day: "Mon", start_time: "09:00", end_time: "10:00" },
    { id: "TS-M-1030", day: "Mon", start_time: "10:30", end_time: "11:30" },
    { id: "TS-T-0900", day: "Tue", start_time: "09:00", end_time: "10:15" },
    { id: "TS-T-1030", day: "Tue", start_time: "10:30", end_time: "11:45" },
    { id: "TS-W-0900", day: "Wed", start_time: "09:00", end_time: "10:00" },
    { id: "TS-W-1030", day: "Wed", start_time: "10:30", end_time: "11:30" },
    { id: "TS-TH-0900", day: "Thu", start_time: "09:00", end_time: "10:15" },
    { id: "TS-TH-1030", day: "Thu", start_time: "10:30", end_time: "11:45" },
  ],
  meeting_patterns: [
    {
      id: "MP-MW-60",
      slots_required: 2,
      allowed_days: ["Mon", "Wed"],
      compatible_timeslot_sets: [
        ["TS-M-0900", "TS-W-0900"],
        ["TS-M-1030", "TS-W-1030"],
      ],
    },
    {
      id: "MP-TR-75",
      slots_required: 2,
      allowed_days: ["Tue", "Thu"],
      compatible_timeslot_sets: [
        ["TS-T-0900", "TS-TH-0900"],
        ["TS-T-1030", "TS-TH-1030"],
      ],
    },
  ],
  crosslist_groups: [
    {
      id: "CLG-1",
      member_section_ids: ["SEC-101-A", "SEC-550-A"],
      require_same_room: true,
    },
  ],
  no_overlap_groups: [
    {
      id: "NOG-1",
      member_section_ids: ["SEC-101-B", "SEC-620-A"],
      reason: "core_required_conflict",
    },
  ],
  blocked_times: [
    {
      scope: "global",
      timeslot_ids: ["TS-T-0900"],
      reason: "university_event",
    },
  ],
  locked_assignments: [
    {
      section_id: "SEC-620-A",
      fixed_timeslot_set: ["TS-M-1030", "TS-W-1030"],
    },
  ],
};

import type { SchedulingInput } from "./types";

export const mockSchedulingInput: SchedulingInput = {
  sections: [
    {
      id: "SEC-101-A",
      course_id: "COURSE-101",
      section_code: "A",
      instructor_id: "INST-ALPHA",
      expected_enrollment: 24,
      enrollment_cap: 30,
      allowed_meeting_patterns: ["MP-MW-60"],
      room_requirements: ["projector"],
      crosslist_group_id: null,
      tags: ["core_required"],
    },
    {
      id: "SEC-220-A",
      course_id: "COURSE-220",
      section_code: "A",
      instructor_id: "INST-BETA",
      expected_enrollment: 18,
      enrollment_cap: 24,
      allowed_meeting_patterns: ["MP-TR-75"],
      room_requirements: [],
      crosslist_group_id: null,
      tags: ["elective"],
    },
  ],
  instructors: [
    {
      id: "INST-ALPHA",
      rank_type: "Tenured",
      unavailable_times: [],
      preferences: {
        preferred_days: ["Mon", "Wed"],
        preferred_patterns: ["MP-MW-60"],
        max_teaching_days: 3,
      },
    },
    {
      id: "INST-BETA",
      rank_type: "Adjunct",
      unavailable_times: [],
      preferences: {
        preferred_days: ["Tue", "Thu"],
        preferred_patterns: ["MP-TR-75"],
        max_teaching_days: 2,
      },
    },
  ],
  rooms: [
    {
      id: "ROOM-A",
      building: "Peters",
      capacity: 40,
      features: ["projector"],
    },
    {
      id: "ROOM-B",
      building: "Smith",
      capacity: 25,
      features: [],
    },
  ],
  timeslots: [
    { id: "TS-M-0900", day: "Mon", start_time: "09:00", end_time: "10:00" },
    { id: "TS-W-0900", day: "Wed", start_time: "09:00", end_time: "10:00" },
    { id: "TS-T-1030", day: "Tue", start_time: "10:30", end_time: "11:45" },
    { id: "TS-TH-1030", day: "Thu", start_time: "10:30", end_time: "11:45" },
  ],
  meeting_patterns: [
    {
      id: "MP-MW-60",
      slots_required: 2,
      allowed_days: ["Mon", "Wed"],
      compatible_timeslot_sets: [["TS-M-0900", "TS-W-0900"]],
    },
    {
      id: "MP-TR-75",
      slots_required: 2,
      allowed_days: ["Tue", "Thu"],
      compatible_timeslot_sets: [["TS-T-1030", "TS-TH-1030"]],
    },
  ],
  crosslist_groups: [],
  no_overlap_groups: [],
  blocked_times: [],
  locked_assignments: [],
};

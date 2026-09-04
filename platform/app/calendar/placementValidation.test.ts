import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluatePlacement, placementTermConflict } from "./placementValidation";
import type { CalendarEvent } from "./calendarEvents";

const baseSection = {
  id: "s1",
  course_id: "101",
  department: "BUAI",
  section_code: "01",
  instructor_id: "inst-1",
  enrollment_cap: 20,
  expected_enrollment: 20,
  room_requirements: ["case_room"],
  allowed_meeting_patterns: ["MWF-10"],
};

const baseRoom = {
  id: "R1",
  capacity: 30,
  features: ["projector"],
};

const baseTimeslot = {
  id: "ts-1",
  start_time: "10:00",
  end_time: "11:15",
  days: "Mon",
  day: "Mon",
};

function makeEvent(
  overrides: Partial<CalendarEvent> & { id: string },
): CalendarEvent {
  const { id, section: sectionOverrides, timeslot, start, end, ...rest } = overrides;
  return {
    ...rest,
    section: {
      course_id: "202",
      department: "MC",
      instructor_id: "inst-2",
      section_code: "01",
      ...sectionOverrides,
      id,
    },
    timeslot: timeslot ?? baseTimeslot,
    start: start ?? 600,
    end: end ?? 690,
  };
}

describe("evaluatePlacement", () => {
  it("blocks in-person placement for online sections", () => {
    const result = evaluatePlacement({
      sectionId: "online-1",
      targetRoomId: "R1",
      slot: {
        id: "t1",
        start_time: "10:00",
        end_time: "11:15",
        days: "Mon",
        start: 600,
        end: 675,
      },
      selectedDay: "Mon",
      data: {
        sections: [{ ...baseSection, id: "online-1", section_number: "801" }],
        rooms: [baseRoom],
      },
      assignmentsBySection: {},
      allDayEvents: [],
      linkedSectionIds: ["online-1"],
      instructorById: new Map([["inst-1", { id: "inst-1", name: "Prof A" }]]),
      findBlockedPlacementMessage: () => null,
      formatTime: (t) => t,
    });
    assert.equal(result.severity, "block");
    assert.equal(result.reasonCode, "online_section");
  });

  it("warns when room is missing required features", () => {
    const result = evaluatePlacement({
      sectionId: "s1",
      targetRoomId: "R1",
      slot: {
        id: "t1",
        start_time: "10:00",
        end_time: "11:15",
        days: "Mon",
        start: 600,
        end: 675,
      },
      selectedDay: "Mon",
      data: {
        sections: [baseSection],
        rooms: [baseRoom],
      },
      assignmentsBySection: {},
      allDayEvents: [],
      linkedSectionIds: ["s1"],
      instructorById: new Map([["inst-1", { id: "inst-1", name: "Prof A" }]]),
      findBlockedPlacementMessage: () => null,
      formatTime: (t) => t,
    });
    assert.equal(result.severity, "warn");
    assert.equal(result.reasonCode, "room_requirements");
  });

  it("detects instructor conflicts between online sections", () => {
    const result = evaluatePlacement({
      sectionId: "online-1",
      targetRoomId: "",
      slot: {
        id: "t2",
        start_time: "10:00",
        end_time: "11:15",
        days: "Mon",
        start: 600,
        end: 675,
      },
      selectedDay: "Mon",
      data: {
        sections: [
          { ...baseSection, id: "online-1", section_number: "801", instructor_id: "inst-1" },
          { ...baseSection, id: "online-2", section_number: "802", instructor_id: "inst-1" },
        ],
        rooms: [baseRoom],
      },
      assignmentsBySection: {},
      allDayEvents: [
        makeEvent({
          id: "online-2",
          section: {
            id: "online-2",
            course_id: "202",
            department: "MC",
            instructor_id: "inst-1",
            section_code: "02",
          },
          start: 600,
          end: 675,
        }),
      ],
      linkedSectionIds: ["online-1"],
      instructorById: new Map([["inst-1", { id: "inst-1", name: "Prof A" }]]),
      findBlockedPlacementMessage: () => null,
      formatTime: (t) => t,
    });
    assert.equal(result.severity, "warn");
    assert.equal(result.reasonCode, "instructor_conflict");
    assert.ok(result.conflictSectionIds.includes("online-2"));
  });
});

const slot = {
  id: "ts-1",
  day: "Mon",
  start_time: "18:15",
  end_time: "19:45",
  start: 18 * 60 + 15,
  end: 19 * 60 + 45,
  slot_type: "evening",
};

function makeMbapEvent(input: {
  id: string;
  instructorId: string;
  sectionNumber?: string;
  roomId?: string;
  semester_length?: string;
  start?: number;
  end?: number;
}): CalendarEvent {
  return {
    section: {
      id: input.id,
      course_id: "MBAP474",
      section_code: "400-LEC",
      section_number: input.sectionNumber ?? "400",
      instructor_id: input.instructorId,
      department: "MBAP",
      room_id: input.roomId ?? "R1",
      semester_length: input.semester_length,
    },
    timeslot: {
      id: "ts-existing",
      day: "Mon",
      start_time: "18:15",
      end_time: "19:45",
      slot_type: "evening",
    },
    start: input.start ?? slot.start,
    end: input.end ?? slot.end,
  };
}

const mbapBaseData = {
  sections: [
    {
      id: "s-new",
      course_id: "MBAP475",
      department: "MBAP",
      instructor_id: "prof-a",
      section_number: "400",
      enrollment_cap: 30,
    },
    {
      id: "s-online",
      course_id: "MBAP475",
      department: "MBAP",
      instructor_id: "prof-a",
      section_number: "801",
      enrollment_cap: 30,
    },
    {
      id: "s-room",
      course_id: "MBAP476",
      department: "MBAP",
      instructor_id: "prof-b",
      section_number: "400",
      enrollment_cap: 30,
    },
    {
      id: "s-other-room",
      course_id: "MBAP477",
      department: "MBAP",
      instructor_id: "prof-c",
      section_number: "400",
      enrollment_cap: 30,
    },
  ],
  rooms: [{ id: "R1", capacity: 40 }],
};

describe("evaluatePlacement instructor conflicts across modalities", () => {
  it("warns when placing in-person while instructor already teaches online at same time", () => {
    const onlineEvent = makeMbapEvent({
      id: "s-online",
      instructorId: "prof-a",
      sectionNumber: "801",
      roomId: "",
    });
    const result = evaluatePlacement({
      sectionId: "s-new",
      targetRoomId: "R1",
      slot,
      selectedDay: "Mon",
      data: mbapBaseData,
      assignmentsBySection: {},
      allDayEvents: [],
      instructorConflictEvents: [onlineEvent],
      linkedSectionIds: ["s-new"],
      instructorById: new Map([["prof-a", { id: "prof-a", name: "Prof A" }]]),
      findBlockedPlacementMessage: () => null,
      formatTime: (t) => t,
    });
    assert.equal(result.severity, "warn");
    assert.equal(result.reasonCode, "instructor_conflict");
  });

  it("warns when placing online while instructor already teaches in-person at same time", () => {
    const inPersonEvent = makeMbapEvent({
      id: "s-room",
      instructorId: "prof-a",
      sectionNumber: "400",
      roomId: "R1",
    });
    const result = evaluatePlacement({
      sectionId: "s-online",
      targetRoomId: "",
      slot,
      selectedDay: "Mon",
      data: mbapBaseData,
      assignmentsBySection: {},
      allDayEvents: [inPersonEvent],
      instructorConflictEvents: [inPersonEvent],
      linkedSectionIds: ["s-online"],
      instructorById: new Map([["prof-a", { id: "prof-a", name: "Prof A" }]]),
      findBlockedPlacementMessage: () => null,
      formatTime: (t) => t,
    });
    assert.equal(result.severity, "warn");
    assert.equal(result.reasonCode, "instructor_conflict");
  });

  it("warns on room conflict only when instructors differ", () => {
    const otherEvent = makeMbapEvent({
      id: "s-other-room",
      instructorId: "prof-c",
      sectionNumber: "400",
      roomId: "R1",
    });
    const result = evaluatePlacement({
      sectionId: "s-new",
      targetRoomId: "R1",
      slot,
      selectedDay: "Mon",
      data: mbapBaseData,
      assignmentsBySection: {},
      allDayEvents: [otherEvent],
      instructorConflictEvents: [otherEvent],
      linkedSectionIds: ["s-new"],
      instructorById: new Map([
        ["prof-a", { id: "prof-a", name: "Prof A" }],
        ["prof-c", { id: "prof-c", name: "Prof C" }],
      ]),
      findBlockedPlacementMessage: () => null,
      formatTime: (t) => t,
    });
    assert.equal(result.severity, "warn");
    assert.equal(result.reasonCode, "room_conflict");
  });

  it("skips room-capacity block for online placement with empty room", () => {
    const result = evaluatePlacement({
      sectionId: "s-online",
      targetRoomId: "",
      slot,
      selectedDay: "Mon",
      data: mbapBaseData,
      assignmentsBySection: {},
      allDayEvents: [],
      instructorConflictEvents: [],
      linkedSectionIds: ["s-online"],
      instructorById: new Map([["prof-a", { id: "prof-a", name: "Prof A" }]]),
      findBlockedPlacementMessage: () => null,
      formatTime: (t) => t,
    });
    assert.equal(result.severity, "ok");
  });
});

describe("evaluatePlacement semester_length-aware room conflicts", () => {
  const termData = {
    sections: [
      {
        id: "s-first",
        course_id: "MBAP474",
        department: "MBAP",
        instructor_id: "prof-a",
        section_number: "400",
        enrollment_cap: 30,
        semester_length: "first_half",
      },
      {
        id: "s-second",
        course_id: "MBAP475",
        department: "MBAP",
        instructor_id: "prof-b",
        section_number: "400",
        enrollment_cap: 30,
        semester_length: "second_half",
      },
      {
        id: "s-half-any",
        course_id: "MBAP476",
        department: "MBAP",
        instructor_id: "prof-c",
        section_number: "400",
        enrollment_cap: 30,
        semester_length: "half_any",
      },
    ],
    rooms: [{ id: "R1", capacity: 40 }],
  };

  it("allows first_half and second_half in the same room at the same time", () => {
    const existing = makeMbapEvent({
      id: "s-first",
      instructorId: "prof-a",
      semester_length: "first_half",
      roomId: "R1",
    });
    const result = evaluatePlacement({
      sectionId: "s-second",
      targetRoomId: "R1",
      slot,
      selectedDay: "Mon",
      data: termData,
      assignmentsBySection: {},
      allDayEvents: [existing],
      instructorConflictEvents: [existing],
      linkedSectionIds: ["s-second"],
      instructorById: new Map([
        ["prof-a", { id: "prof-a", name: "Prof A" }],
        ["prof-b", { id: "prof-b", name: "Prof B" }],
      ]),
      findBlockedPlacementMessage: () => null,
      formatTime: (t) => t,
    });
    assert.equal(result.severity, "ok");
  });

  it("allows half_any with no assigned_half against first_half", () => {
    const existing = makeMbapEvent({
      id: "s-first",
      instructorId: "prof-a",
      semester_length: "first_half",
      roomId: "R1",
    });
    const result = evaluatePlacement({
      sectionId: "s-half-any",
      targetRoomId: "R1",
      slot,
      selectedDay: "Mon",
      data: termData,
      assignmentsBySection: {},
      allDayEvents: [existing],
      instructorConflictEvents: [existing],
      linkedSectionIds: ["s-half-any"],
      instructorById: new Map([
        ["prof-a", { id: "prof-a", name: "Prof A" }],
        ["prof-c", { id: "prof-c", name: "Prof C" }],
      ]),
      findBlockedPlacementMessage: () => null,
      formatTime: (t) => t,
    });
    assert.equal(result.severity, "ok");
  });

  it("warns when half_any cannot fit because both halves are occupied", () => {
    const first = makeMbapEvent({
      id: "s-first",
      instructorId: "prof-a",
      semester_length: "first_half",
      roomId: "R1",
    });
    const second = makeMbapEvent({
      id: "s-second",
      instructorId: "prof-b",
      semester_length: "second_half",
      roomId: "R1",
    });
    const result = evaluatePlacement({
      sectionId: "s-half-any",
      targetRoomId: "R1",
      slot,
      selectedDay: "Mon",
      data: termData,
      assignmentsBySection: {},
      allDayEvents: [first, second],
      instructorConflictEvents: [first, second],
      linkedSectionIds: ["s-half-any"],
      instructorById: new Map([
        ["prof-a", { id: "prof-a", name: "Prof A" }],
        ["prof-b", { id: "prof-b", name: "Prof B" }],
        ["prof-c", { id: "prof-c", name: "Prof C" }],
      ]),
      findBlockedPlacementMessage: () => null,
      formatTime: (t) => t,
    });
    assert.equal(result.severity, "warn");
    assert.equal(result.reasonCode, "room_conflict");
  });

  it("allows half_any with assigned_half first_half against second_half", () => {
    const existing = makeMbapEvent({
      id: "s-second",
      instructorId: "prof-b",
      semester_length: "second_half",
      roomId: "R1",
    });
    const result = evaluatePlacement({
      sectionId: "s-half-any",
      targetRoomId: "R1",
      slot,
      selectedDay: "Mon",
      data: termData,
      assignmentsBySection: {
        "s-half-any": {
          timeslot_ids: [],
          room_id: "R1",
          meeting_pattern_id: "",
          assigned_half: "first_half",
        },
      },
      allDayEvents: [existing],
      instructorConflictEvents: [existing],
      linkedSectionIds: ["s-half-any"],
      instructorById: new Map([
        ["prof-b", { id: "prof-b", name: "Prof B" }],
        ["prof-c", { id: "prof-c", name: "Prof C" }],
      ]),
      findBlockedPlacementMessage: () => null,
      formatTime: (t) => t,
    });
    assert.equal(result.severity, "ok");
  });

  it("placementTermConflict is false for complementary halves (sidebar path)", () => {
    assert.equal(
      placementTermConflict(
        ["s-second"],
        ["s-first"],
        termData,
        {
          "s-first": {
            timeslot_ids: ["ts-1"],
            room_id: "R1",
            meeting_pattern_id: "",
          },
        },
      ),
      false,
    );
  });

  it("placementTermConflict is false for half_any against a single occupied half", () => {
    assert.equal(
      placementTermConflict(
        ["s-half-any"],
        ["s-first"],
        termData,
        {
          "s-first": {
            timeslot_ids: ["ts-1"],
            room_id: "R1",
            meeting_pattern_id: "",
          },
        },
      ),
      false,
    );
  });

  it("placementTermConflict is true when half_any cannot fit both halves", () => {
    assert.equal(
      placementTermConflict(
        ["s-half-any"],
        ["s-first", "s-second"],
        termData,
        {
          "s-first": {
            timeslot_ids: ["ts-1"],
            room_id: "R1",
            meeting_pattern_id: "",
          },
          "s-second": {
            timeslot_ids: ["ts-1"],
            room_id: "R1",
            meeting_pattern_id: "",
          },
        },
      ),
      true,
    );
  });
});

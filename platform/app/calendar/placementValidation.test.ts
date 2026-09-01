import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CalendarEvent } from "./calendarEvents";
import { evaluatePlacement } from "./placementValidation";

const slot = {
  id: "ts-1",
  day: "Mon",
  start_time: "18:15",
  end_time: "19:45",
  start: 18 * 60 + 15,
  end: 19 * 60 + 45,
  slot_type: "evening",
};

function makeEvent(input: {
  id: string;
  instructorId: string;
  sectionNumber?: string;
  roomId?: string;
  term?: string;
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
      term: input.term,
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

const baseData = {
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
    const onlineEvent = makeEvent({
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
      data: baseData,
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
    const inPersonEvent = makeEvent({
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
      data: baseData,
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
    const otherEvent = makeEvent({
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
      data: baseData,
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
      data: baseData,
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

describe("evaluatePlacement term-aware room conflicts", () => {
  const termData = {
    sections: [
      {
        id: "s-first",
        course_id: "MBAP474",
        department: "MBAP",
        instructor_id: "prof-a",
        section_number: "400",
        enrollment_cap: 30,
        term: "first_half",
      },
      {
        id: "s-second",
        course_id: "MBAP475",
        department: "MBAP",
        instructor_id: "prof-b",
        section_number: "400",
        enrollment_cap: 30,
        term: "second_half",
      },
      {
        id: "s-half-any",
        course_id: "MBAP476",
        department: "MBAP",
        instructor_id: "prof-c",
        section_number: "400",
        enrollment_cap: 30,
        term: "half_any",
      },
    ],
    rooms: [{ id: "R1", capacity: 40 }],
  };

  it("allows first_half and second_half in the same room at the same time", () => {
    const existing = makeEvent({
      id: "s-first",
      instructorId: "prof-a",
      term: "first_half",
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

  it("warns when half_any has no assigned_half against first_half", () => {
    const existing = makeEvent({
      id: "s-first",
      instructorId: "prof-a",
      term: "first_half",
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
    assert.equal(result.severity, "warn");
    assert.equal(result.reasonCode, "room_conflict");
  });

  it("allows half_any with assigned_half first_half against second_half", () => {
    const existing = makeEvent({
      id: "s-second",
      instructorId: "prof-b",
      term: "second_half",
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
});

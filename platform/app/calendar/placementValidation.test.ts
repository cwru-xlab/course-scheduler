import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluatePlacement } from "./placementValidation";
import type { CalendarEvent } from "./calendarEvents";

const baseSection = {
  id: "s1",
  course_id: "101",
  department: "BUAI",
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

function makeEvent(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    id: overrides.id,
    section: {
      id: overrides.id,
      course_id: "202",
      department: "MC",
      instructor_id: "inst-2",
    },
    start: 600,
    end: 690,
    roomId: "R1",
    ...overrides,
  } as CalendarEvent;
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
          },
          start: 600,
          end: 675,
          roomId: "",
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

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assignEventLanes,
  buildAssignmentRows,
  collectDayEvents,
  collectOnlineGridEvents,
  mergeConcurrentSlotEvents,
  type GridEvent,
  type RoomAssignmentWorkbookInput,
} from "./roomAssignmentWorkbook";

function baseInput(
  overrides: Partial<RoomAssignmentWorkbookInput> = {},
): RoomAssignmentWorkbookInput {
  return {
    sections: [],
    instructors: [{ id: "inst-1", name: "Dr. Smith" }],
    rooms: [{ id: "room-a", building: "Main", room_number: "101" }],
    timeslots: [
      {
        id: "ts-mon",
        days: "Mon",
        start_time: "09:00",
        end_time: "10:15",
      },
    ],
    assignments: {},
    ...overrides,
  };
}

describe("assignEventLanes", () => {
  it("assigns separate lanes for simultaneous events", () => {
    const laned = assignEventLanes([
      { startMin: 540, endMin: 615 },
      { startMin: 540, endMin: 615 },
    ]);
    assert.equal(laned.length, 2);
    assert.equal(laned[0].lane, 0);
    assert.equal(laned[1].lane, 1);
  });

  it("reuses a lane when the prior event has ended", () => {
    const laned = assignEventLanes([
      { startMin: 540, endMin: 600 },
      { startMin: 600, endMin: 660 },
    ]);
    assert.equal(laned.length, 2);
    assert.equal(laned[0].lane, 0);
    assert.equal(laned[1].lane, 0);
  });
});

describe("buildAssignmentRows", () => {
  it("shows Online in room column for section numbers 800–899", () => {
    const input = baseInput({
      sections: [
        {
          id: "sec-online",
          course_id: "Virtual Leadership",
          department: "MGMT",
          section_code: "850",
          section_number: "801",
          instructor_id: "inst-1",
        },
      ],
      assignments: {
        "sec-online": { timeslot_ids: ["ts-mon"], room_id: "" },
      },
    });

    const rows = buildAssignmentRows(input);
    assert.equal(rows.length, 1);
    assert.equal(rows[0][7], "Online");
  });

  it("includes resolved duration for half-semester sections", () => {
    const input = baseInput({
      sections: [
        {
          id: "sec-half",
          course_id: "Leadership",
          department: "MBAP",
          section_code: "476",
          section_number: "400",
          instructor_id: "inst-1",
          semester_length: "half_any",
        },
      ],
      assignments: {
        "sec-half": {
          timeslot_ids: ["ts-mon"],
          room_id: "room-a",
          assigned_half: "second_half",
        },
      },
    });

    const rows = buildAssignmentRows(input);
    assert.equal(rows[0][5], "2nd Half");
  });
});

describe("collectOnlineGridEvents", () => {
  it("returns grid events with time in the label", () => {
    const input = baseInput({
      sections: [
        {
          id: "sec-online",
          course_id: "Virtual Leadership",
          department: "MGMT",
          section_code: "850",
          section_number: "801",
          instructor_id: "inst-1",
        },
      ],
      assignments: {
        "sec-online": { timeslot_ids: ["ts-mon"], room_id: "" },
      },
    });

    const events = collectOnlineGridEvents("Mon", input);
    assert.equal(events.length, 1);
    assert.match(events[0].label, /9:00AM/);
    assert.match(events[0].label, /MGMT/);
    assert.match(events[0].label, /Dr\. Smith/);
  });

  it("returns no events on days without a matching timeslot", () => {
    const input = baseInput({
      sections: [
        {
          id: "sec-online",
          course_id: "Virtual Leadership",
          department: "MGMT",
          section_code: "850",
          section_number: "801",
          instructor_id: "inst-1",
        },
      ],
      assignments: {
        "sec-online": { timeslot_ids: ["ts-mon"], room_id: "" },
      },
    });

    assert.equal(collectOnlineGridEvents("Tue", input).length, 0);
  });

  it("assigns two lanes for two overlapping online sections", () => {
    const input = baseInput({
      sections: [
        {
          id: "sec-online-a",
          course_id: "Virtual Leadership",
          department: "MGMT",
          section_code: "850",
          section_number: "801",
          instructor_id: "inst-1",
        },
        {
          id: "sec-online-b",
          course_id: "Online Accounting",
          department: "ACCT",
          section_code: "820",
          section_number: "802",
          instructor_id: "inst-1",
        },
      ],
      assignments: {
        "sec-online-a": { timeslot_ids: ["ts-mon"], room_id: "" },
        "sec-online-b": { timeslot_ids: ["ts-mon"], room_id: "" },
      },
    });

    const laned = assignEventLanes(collectOnlineGridEvents("Mon", input));
    assert.equal(laned.length, 2);
    assert.equal(new Set(laned.map((e) => e.lane)).size, 2);
  });
});

describe("mergeConcurrentSlotEvents", () => {
  function gridEvent(
    overrides: Partial<GridEvent> & Pick<GridEvent, "label" | "termStackRank">,
  ): GridEvent {
    return {
      roomId: "room-a",
      startMin: 540,
      endMin: 615,
      departmentKey: "MBAP",
      groupKey: "section::x",
      isCrosslist: false,
      ...overrides,
    };
  }

  it("stacks H1 above H2 when both share the same time span", () => {
    const merged = mergeConcurrentSlotEvents([
      gridEvent({ label: "H2\nStrategy", termStackRank: 1, groupKey: "section::h2" }),
      gridEvent({ label: "H1\nLeadership", termStackRank: 0, groupKey: "section::h1" }),
    ]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].label, "H1\nLeadership\n\nH2\nStrategy");
  });
});

describe("collectDayEvents", () => {
  it("excludes online sections from room grids", () => {
    const input = baseInput({
      sections: [
        {
          id: "sec-online",
          course_id: "Virtual Leadership",
          department: "MGMT",
          section_code: "850",
          section_number: "801",
          instructor_id: "inst-1",
        },
        {
          id: "sec-room",
          course_id: "Accounting",
          department: "ACCT",
          section_code: "101",
          section_number: "1",
          instructor_id: "inst-1",
        },
      ],
      assignments: {
        "sec-online": { timeslot_ids: ["ts-mon"], room_id: "" },
        "sec-room": { timeslot_ids: ["ts-mon"], room_id: "room-a" },
      },
    });

    const events = collectDayEvents("Mon", input);
    assert.equal(events.length, 1);
    assert.equal(events[0].roomId, "room-a");
  });

  it("includes H1/H2 badge in grid labels for half-semester sections", () => {
    const input = baseInput({
      sections: [
        {
          id: "sec-h1",
          course_id: "Leadership",
          department: "MBAP",
          section_code: "476",
          section_number: "400",
          instructor_id: "inst-1",
          semester_length: "first_half",
        },
        {
          id: "sec-h2",
          course_id: "Strategy",
          department: "MBAP",
          section_code: "477",
          section_number: "401",
          instructor_id: "inst-1",
          semester_length: "second_half",
        },
      ],
      assignments: {
        "sec-h1": { timeslot_ids: ["ts-mon"], room_id: "room-a" },
        "sec-h2": { timeslot_ids: ["ts-mon"], room_id: "room-a" },
      },
    });

    const events = collectDayEvents("Mon", input);
    assert.equal(events.length, 2);
    assert.match(events.find((event) => event.groupKey.includes("sec-h1"))!.label, /^H1/);
    assert.match(events.find((event) => event.groupKey.includes("sec-h2"))!.label, /^H2/);
  });
});

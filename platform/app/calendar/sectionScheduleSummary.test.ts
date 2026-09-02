import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeSectionSchedule } from "./sectionScheduleSummary";

describe("describeSectionSchedule", () => {
  it("formats scheduled in-person section with day, time, and room", () => {
    const timeslotById = new Map([
      [
        "t1",
        {
          id: "t1",
          days: "Tue",
          start_time: "18:00",
          end_time: "20:30",
        },
      ],
    ]);
    const summary = describeSectionSchedule(
      { id: "s1", room_id: "R1", section_number: "100" },
      {
        s1: {
          timeslot_ids: ["t1"],
          room_id: "R1",
          meeting_pattern_id: "MP-B-75",
        },
      },
      {},
      timeslotById,
      [{ id: "R1", building: "PBL", room_number: "106" }],
      "MP-B-75",
    );
    assert.equal(summary.isScheduled, true);
    assert.deepEqual(summary.dayLabels, ["Tue"]);
    assert.match(summary.slotLines[0] ?? "", /6:00 PM/);
    assert.match(summary.roomLabel ?? "", /PBL/);
    assert.equal(summary.assignedMeetingPatternId, "MP-B-75");
  });

  it("reports online band for online sections", () => {
    const timeslotById = new Map([
      [
        "t1",
        {
          id: "t1",
          days: "Wed",
          start_time: "09:00",
          end_time: "10:15",
        },
      ],
    ]);
    const summary = describeSectionSchedule(
      { id: "s1", section_number: "801" },
      { s1: { timeslot_ids: ["t1"], room_id: "", meeting_pattern_id: "MWF-10" } },
      {},
      timeslotById,
      [],
    );
    assert.equal(summary.isOnline, true);
    assert.equal(summary.roomLabel, "Online band");
  });

  it("returns not scheduled for queued sections", () => {
    const summary = describeSectionSchedule(
      { id: "s1", section_number: "100" },
      {},
      {},
      new Map(),
      [],
    );
    assert.equal(summary.isScheduled, false);
    assert.equal(summary.slotLines.length, 0);
  });
});

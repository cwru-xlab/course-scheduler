import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EDITOR_ARCHIVED_WHILE_SCHEDULED_TAG,
  getCalendarPlacedSectionIds,
  sectionArchivedFromEditor,
  tagSectionArchivedFromEditor,
} from "./calendarPlacementGuard";
import type { LastSolverRunSnapshot } from "./history";
import type { SchedulingInput } from "./types";

function makeSnapshot(
  sections: SchedulingInput["sections"],
  assignments: LastSolverRunSnapshot["solution"]["assignments"],
): LastSolverRunSnapshot {
  return {
    input: {
      sections,
      instructors: [],
      rooms: [],
      timeslots: [],
      meeting_patterns: [],
      crosslist_groups: [],
      no_overlap_groups: [],
      blocked_times: [],
      locked_assignments: [],
      soft_locks: [],
    },
    solution: {
      assignments,
      total_score: 0,
      penalty_breakdown: {},
      explanations: [],
    },
    createdAt: new Date().toISOString(),
  };
}

describe("calendarPlacementGuard", () => {
  it("counts online sections as placed without room_id", () => {
    const snapshot = makeSnapshot(
      [
        {
          id: "online-1",
          course_id: "101",
          section_code: "A",
          section_number: "801",
          instructor_id: "i1",
          expected_enrollment: 10,
          enrollment_cap: 10,
          allowed_meeting_patterns: [],
          room_requirements: [],
          tags: [],
        },
      ],
      [
        {
          section_id: "online-1",
          timeslot_ids: ["t1"],
          room_id: "",
          meeting_pattern_id: "MWF-10",
        },
      ],
    );
    const placed = getCalendarPlacedSectionIds(snapshot);
    assert.equal(placed.has("online-1"), true);
  });

  it("does not count unplaced sections", () => {
    const snapshot = makeSnapshot(
      [
        {
          id: "s1",
          course_id: "101",
          section_code: "A",
          section_number: "1",
          instructor_id: "i1",
          expected_enrollment: 10,
          enrollment_cap: 10,
          allowed_meeting_patterns: [],
          room_requirements: [],
          tags: [],
        },
      ],
      [
        {
          section_id: "s1",
          timeslot_ids: [],
          room_id: "",
          meeting_pattern_id: "",
        },
      ],
    );
    const placed = getCalendarPlacedSectionIds(snapshot);
    assert.equal(placed.has("s1"), false);
  });

  it("tags archived-from-editor sections", () => {
    const tagged = tagSectionArchivedFromEditor({ id: "s1", tags: ["honors"] });
    assert.ok(tagged.tags?.includes(EDITOR_ARCHIVED_WHILE_SCHEDULED_TAG));
    assert.equal(sectionArchivedFromEditor(tagged), true);
  });
});

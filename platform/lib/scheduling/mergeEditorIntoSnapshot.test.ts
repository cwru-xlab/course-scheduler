import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validatePreservedAssignment, roomMeetsRequirements } from "../../app/calendar/placementValidation";
import { mergeEditorIntoSnapshot } from "./mergeEditorIntoSnapshot";
import type { LastSolverRunSnapshot } from "./history";
import type { SchedulingInput } from "./types";

function baseSection(
  id: string,
  overrides: Partial<SchedulingInput["sections"][number]> = {},
): SchedulingInput["sections"][number] {
  return {
    id,
    course_id: "101",
    section_code: "A",
    section_number: "1",
    instructor_id: "inst-1",
    expected_enrollment: 20,
    enrollment_cap: 20,
    allowed_meeting_patterns: ["MWF-10"],
    room_requirements: [],
    tags: [],
    ...overrides,
  };
}

function baseRoom(id: string, overrides: Partial<SchedulingInput["rooms"][number]> = {}): SchedulingInput["rooms"][number] {
  return {
    id,
    building: "Main",
    room_number: id,
    capacity: 30,
    features: ["projector"],
    ...overrides,
  };
}

function baseInput(sections: SchedulingInput["sections"], rooms: SchedulingInput["rooms"]): SchedulingInput {
  return {
    sections,
    instructors: [],
    rooms,
    timeslots: [],
    meeting_patterns: [],
    crosslist_groups: [],
    no_overlap_groups: [],
    blocked_times: [],
    locked_assignments: [],
    soft_locks: [],
  };
}

function snapshotFromInput(
  input: SchedulingInput,
  assignments: LastSolverRunSnapshot["solution"]["assignments"],
): LastSolverRunSnapshot {
  return {
    input,
    solution: {
      assignments,
      total_score: 0,
      penalty_breakdown: {},
      explanations: [],
    },
    createdAt: new Date().toISOString(),
  };
}

describe("roomMeetsRequirements", () => {
  it("returns true when room has all required features", () => {
    assert.equal(roomMeetsRequirements({ features: ["projector", "case_room"] }, ["projector"]), true);
  });

  it("returns false when a required feature is missing", () => {
    assert.equal(roomMeetsRequirements({ features: ["projector"] }, ["case_room"]), false);
  });
});

describe("validatePreservedAssignment", () => {
  const rooms = [baseRoom("R1")];
  const sections = [baseSection("s1")];

  it("invalidates when enrollment cap exceeds room capacity", () => {
    const fresh = baseSection("s1", { enrollment_cap: 35 });
    const result = validatePreservedAssignment({
      section: fresh,
      prevSection: sections[0],
      linkedSectionIds: ["s1"],
      allSections: [fresh],
      assignment: { room_id: "R1", meeting_pattern_id: "MWF-10", timeslot_ids: ["t1"] },
      rooms,
    });
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "capacity");
  });

  it("keeps placement when cap still fits", () => {
    const fresh = baseSection("s1", { enrollment_cap: 28 });
    const result = validatePreservedAssignment({
      section: fresh,
      prevSection: sections[0],
      linkedSectionIds: ["s1"],
      allSections: [fresh],
      assignment: { room_id: "R1", meeting_pattern_id: "MWF-10", timeslot_ids: ["t1"] },
      rooms,
    });
    assert.equal(result.valid, true);
  });

  it("invalidates when room requirements are not met", () => {
    const fresh = baseSection("s1", { room_requirements: ["case_room"] });
    const result = validatePreservedAssignment({
      section: fresh,
      prevSection: sections[0],
      linkedSectionIds: ["s1"],
      allSections: [fresh],
      assignment: { room_id: "R1", meeting_pattern_id: "MWF-10", timeslot_ids: ["t1"] },
      rooms,
    });
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "room_requirements");
  });

  it("invalidates when allowed patterns change and placement pattern is no longer allowed", () => {
    const prev = baseSection("s1", { allowed_meeting_patterns: ["MWF-10", "TR-11"] });
    const fresh = baseSection("s1", { allowed_meeting_patterns: ["TR-11"] });
    const result = validatePreservedAssignment({
      section: fresh,
      prevSection: prev,
      linkedSectionIds: ["s1"],
      allSections: [fresh],
      assignment: { room_id: "R1", meeting_pattern_id: "MWF-10", timeslot_ids: ["t1"] },
      rooms,
    });
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "pattern");
  });

  it("uses max enrollment across crosslist peers", () => {
    const s1 = baseSection("s1", {
      enrollment_cap: 20,
      crosslist_group_id: "xl-1",
    });
    const s2 = baseSection("s2", {
      enrollment_cap: 40,
      crosslist_group_id: "xl-1",
    });
    const result = validatePreservedAssignment({
      section: s1,
      prevSection: s1,
      linkedSectionIds: ["s1", "s2"],
      allSections: [s1, s2],
      assignment: { room_id: "R1", meeting_pattern_id: "MWF-10", timeslot_ids: ["t1"] },
      rooms: [baseRoom("R1", { capacity: 35, features: [] })],
    });
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "capacity");
  });

  it("skips room capacity for online sections", () => {
    const fresh = baseSection("s1", { section_number: "801", enrollment_cap: 200 });
    const result = validatePreservedAssignment({
      section: fresh,
      prevSection: baseSection("s1", { section_number: "801", enrollment_cap: 20 }),
      linkedSectionIds: ["s1"],
      allSections: [fresh],
      assignment: { room_id: "R1", meeting_pattern_id: "MWF-10", timeslot_ids: ["t1"] },
      rooms: [baseRoom("R1", { capacity: 30, features: [] })],
    });
    assert.equal(result.valid, true);
  });
});

describe("mergeEditorIntoSnapshot", () => {
  const rooms = [baseRoom("R1")];

  it("drops assignment and records capacity invalidation when cap increases", () => {
    const prevInput = baseInput([baseSection("s1", { enrollment_cap: 20 })], rooms);
    const freshInput = baseInput([baseSection("s1", { enrollment_cap: 35 })], rooms);
    const existing = snapshotFromInput(prevInput, [
      {
        section_id: "s1",
        room_id: "R1",
        timeslot_ids: ["t1"],
        meeting_pattern_id: "MWF-10",
      },
    ]);

    const result = mergeEditorIntoSnapshot(existing, freshInput);
    assert.equal(result.editorInvalidatedPlacements.length, 1);
    assert.equal(result.editorInvalidatedPlacements[0]?.sectionId, "s1");
    assert.equal(result.editorInvalidatedPlacements[0]?.reason, "capacity");
    assert.equal(result.snapshot.solution.assignments.length, 0);
  });

  it("preserves assignment when editor change still fits", () => {
    const prevInput = baseInput([baseSection("s1", { enrollment_cap: 20 })], rooms);
    const freshInput = baseInput([baseSection("s1", { enrollment_cap: 28 })], rooms);
    const existing = snapshotFromInput(prevInput, [
      {
        section_id: "s1",
        room_id: "R1",
        timeslot_ids: ["t1"],
        meeting_pattern_id: "MWF-10",
      },
    ]);

    const result = mergeEditorIntoSnapshot(existing, freshInput);
    assert.equal(result.editorInvalidatedPlacements.length, 0);
    assert.equal(result.snapshot.solution.assignments.length, 1);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  persistedSectionTimeslotIds,
  resolveEffectiveAssignment,
} from "./sectionOnline";

describe("persistedSectionTimeslotIds", () => {
  it("prefers timeslot_ids array when present", () => {
    assert.deepEqual(
      persistedSectionTimeslotIds({
        timeslot_ids: ["ts-mon", "ts-wed"],
        timeslot_id: "ts-mon",
      }),
      ["ts-mon", "ts-wed"],
    );
  });

  it("falls back to legacy timeslot_id", () => {
    assert.deepEqual(
      persistedSectionTimeslotIds({ timeslot_id: "ts-tue" }),
      ["ts-tue"],
    );
  });

  it("returns empty when unplaced", () => {
    assert.deepEqual(persistedSectionTimeslotIds({}), []);
  });
});

describe("resolveEffectiveAssignment", () => {
  it("uses section.timeslot_ids when assignment has room but no timeslots", () => {
    const resolved = resolveEffectiveAssignment(
      { timeslot_ids: ["ts-mon", "ts-wed"], timeslot_id: "ts-mon" },
      { timeslot_ids: [], room_id: "R1", meeting_pattern_id: "MW" },
    );
    assert.deepEqual(resolved.timeslot_ids, ["ts-mon", "ts-wed"]);
  });

  it("prefers assignment map timeslot_ids over section fields", () => {
    const resolved = resolveEffectiveAssignment(
      { timeslot_ids: ["ts-mon"], timeslot_id: "ts-mon" },
      { timeslot_ids: ["ts-mon", "ts-wed"], room_id: "R1", meeting_pattern_id: "MW" },
    );
    assert.deepEqual(resolved.timeslot_ids, ["ts-mon", "ts-wed"]);
  });
});

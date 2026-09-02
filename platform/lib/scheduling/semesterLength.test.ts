import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SemesterLength } from "./types";
import {
  displayAssignedHalfForSection,
  normalizeSemesterLength,
  normalizeAssignedHalf,
  resolveDisplayHalvesForRoomPlacements,
  resolveHalfAnyHalf,
  slotHasTermConflict,
  termsConflict,
  termBadgeLabel,
} from "./semesterLength";

describe("semesterLength conflict helpers", () => {
  it("normalizes aliases", () => {
    assert.equal(normalizeSemesterLength("1st half"), "first_half");
    assert.equal(normalizeSemesterLength("half"), "half_any");
    assert.equal(normalizeSemesterLength("h2"), "second_half");
  });

  it("normalizes assigned half", () => {
    assert.equal(normalizeAssignedHalf("1st half"), "first_half");
    assert.equal(normalizeAssignedHalf("full"), null);
    assert.equal(normalizeAssignedHalf(""), null);
  });

  it("allows first and second half to share a slot", () => {
    assert.equal(termsConflict("first_half", "second_half"), false);
  });

  it("blocks full vs half", () => {
    assert.equal(termsConflict("full", "first_half"), true);
  });

  it("allows unresolved half_any against a fixed half", () => {
    assert.equal(termsConflict("half_any", "first_half"), false);
    assert.equal(termsConflict("second_half", "half_any"), false);
  });

  it("allows two half_any sections to share a slot", () => {
    assert.equal(termsConflict("half_any", "half_any"), false);
  });

  it("blocks half_any against full", () => {
    assert.equal(termsConflict("half_any", "full"), true);
  });

  it("blocks half_any when assigned to the same half", () => {
    assert.equal(
      termsConflict("half_any", "first_half", "first_half", undefined),
      true,
    );
    assert.equal(
      termsConflict("half_any", "second_half", "first_half", undefined),
      false,
    );
  });

  it("resolves half_any to the open half", () => {
    assert.equal(
      resolveHalfAnyHalf({ semesterLength: "half_any", occupiedHalves: [] }),
      "first_half",
    );
    assert.equal(
      resolveHalfAnyHalf({
        semesterLength: "half_any",
        occupiedHalves: ["first_half"] as SemesterLength[],
      }),
      "second_half",
    );
    assert.equal(
      resolveHalfAnyHalf({
        semesterLength: "half_any",
        occupiedHalves: ["first_half", "second_half"] as SemesterLength[],
      }),
      null,
    );
  });

  it("detects slot conflicts with three half sections", () => {
    assert.equal(
      slotHasTermConflict([
        { sectionId: "a", semesterLength: "first_half" },
        { sectionId: "b", semesterLength: "second_half" },
        { sectionId: "c", semesterLength: "half_any" },
      ]),
      true,
    );
  });

  it("renders badges for half terms only", () => {
    assert.equal(termBadgeLabel("full"), null);
    assert.equal(termBadgeLabel("first_half"), "H1");
    assert.equal(termBadgeLabel("half_any", "second_half"), "H2");
    assert.equal(termBadgeLabel("half_any"), "H1");
    assert.equal(
      termBadgeLabel("half_any", undefined, ["first_half"] as SemesterLength[]),
      "H2",
    );
  });

  it("resolves overlapping half_any siblings to H1 and H2 for display", () => {
    const resolved = resolveDisplayHalvesForRoomPlacements([
      {
        sectionId: "a",
        roomId: "101",
        startMin: 8 * 60 + 55,
        endMin: 10 * 60 + 10,
        semesterLength: "half_any",
        assignedHalf: "first_half",
      },
      {
        sectionId: "b",
        roomId: "101",
        startMin: 9 * 60 + 20,
        endMin: 10 * 60 + 40,
        semesterLength: "half_any",
        assignedHalf: "first_half",
      },
    ]);
    assert.equal(resolved.get("a"), "first_half");
    assert.equal(resolved.get("b"), "second_half");
  });

  it("ignores stored assigned_half for half_any when resolving display", () => {
    const displayMap = resolveDisplayHalvesForRoomPlacements([
      {
        sectionId: "solo",
        roomId: "101",
        startMin: 9 * 60,
        endMin: 10 * 60,
        semesterLength: "half_any",
        assignedHalf: "second_half",
      },
    ]);
    assert.equal(
      displayAssignedHalfForSection("solo", "half_any", displayMap, "second_half"),
      "first_half",
    );
  });
});

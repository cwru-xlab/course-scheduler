import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeSectionTerm, termsConflict, termBadgeLabel } from "./sectionTerm";

describe("sectionTerm", () => {
  it("normalizes aliases", () => {
    assert.equal(normalizeSectionTerm("1st_half"), "first_half");
    assert.equal(normalizeSectionTerm("half"), "half_any");
  });

  it("allows first and second half to share a slot", () => {
    assert.equal(termsConflict("first_half", "second_half"), false);
  });

  it("blocks full vs half", () => {
    assert.equal(termsConflict("full", "first_half"), true);
  });

  it("renders badges for half terms only", () => {
    assert.equal(termBadgeLabel("full"), null);
    assert.equal(termBadgeLabel("first_half"), "H1");
    assert.equal(termBadgeLabel("half_any", "second_half"), "H2");
  });
});

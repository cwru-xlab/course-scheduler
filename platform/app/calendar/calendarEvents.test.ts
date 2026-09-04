import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assignCalendarEventLanes } from "./calendarEvents";

describe("assignCalendarEventLanes", () => {
  it("places H1 above H2 when halves overlap even if H2 starts earlier", () => {
    const h2 = { id: "h2", start: 8 * 60 + 55, end: 10 * 60 + 15, rank: 1 };
    const h1 = { id: "h1", start: 9 * 60 + 20, end: 10 * 60 + 40, rank: 0 };
    const lanes = assignCalendarEventLanes([h2, h1], (event) => event.rank);
    const byId = Object.fromEntries(lanes.map((event) => [event.id, event.lane]));
    assert.equal(byId.h1, 0);
    assert.equal(byId.h2, 1);
  });

  it("lets non-overlapping H1 and H2 share the same lane", () => {
    const h2 = { id: "h2", start: 8 * 60 + 55, end: 10 * 60 + 15, rank: 1 };
    const h1 = { id: "h1", start: 12 * 60 + 35, end: 13 * 60 + 50, rank: 0 };
    const lanes = assignCalendarEventLanes([h2, h1], (event) => event.rank);
    const byId = Object.fromEntries(lanes.map((event) => [event.id, event.lane]));
    assert.equal(byId.h1, 0);
    assert.equal(byId.h2, 0);
  });

  it("keeps start-time packing when no stack rank is provided", () => {
    const early = { id: "early", start: 9 * 60, end: 10 * 60 };
    const late = { id: "late", start: 9 * 60 + 30, end: 10 * 60 + 30 };
    const lanes = assignCalendarEventLanes([late, early]);
    const byId = Object.fromEntries(lanes.map((event) => [event.id, event.lane]));
    assert.equal(byId.early, 0);
    assert.equal(byId.late, 1);
  });
});

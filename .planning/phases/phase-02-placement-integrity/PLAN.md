# Phase 2: Placement Integrity

## Goal

Prevent silent data corruption: locked sections stay locked, multi-day patterns aren't broken by drag, and meeting-pattern flow doesn't orphan half-placed sections.

## Prerequisites

Phase 1 complete (shared `evaluatePlacement` and `warning` status).

## Issues solved

- **C3** — Drag only updates selected day; MWF patterns desync
- **C4** — Locked sections still draggable
- **C5** — Click persists before pattern modal completes
- **C6** — Click vs drag persistence/undo asymmetry (partial — full undo in Phase 3)

---

## Task 2.1 — Block drag on locked sections

**File:** `platform/app/calendar/page.tsx` — event card `onPointerDown`

1. Before `setCalendarDrag`, check `isPlacementLocked(dragSectionId)` (or any crosslist member).
2. If locked:
   - Do not start drag
   - `setDragFeedback({ status: "invalid", message: "This section is locked for the solver. Unlock it in the schedule table to move it." })`
3. Optionally dim cursor / skip `draggable` styling when locked.

**Also:** Crosslist card — lock if **any** member locked (already computed as `placementLocked`).

**Acceptance:** Locked card does not move; user sees clear message.

---

## Task 2.2 — Pattern-aware drag detection

**File:** `platform/app/calendar/page.tsx`

1. Add helper `sectionHasMultiDayPattern(sectionId, assignments, timeslotById)`:
   - True if `timeslot_ids.length > 1` OR `meeting_pattern_id` set with pattern spanning multiple days.
2. In `commitCalendarPlacement`, after successful slot change, if multi-day pattern:
   - **Option A (recommended):** Open meeting-pattern reselection modal (reuse `buildMeetingPatternOptionsForPlacement` + existing modal) with copy: "This section uses a multi-day pattern. Choose how to apply this move."
   - **Option B (lighter):** Set `warning` message: "Only {selectedDay} was updated. Other pattern days unchanged." Do not auto-clear other days.

**Decision for executor:** Implement Option A if modal wiring is straightforward; else Option B as MVP.

**Acceptance:** User is never left thinking all pattern days moved when only one did.

---

## Task 2.3 — Defer persistence until pattern chosen

**File:** `platform/app/calendar/page.tsx` — `commitPlacementByClick`

**Current bug:** `persistCalendarAssignments` runs before modal (~2975).

**Fix:**

1. When `needsPatternSelection`:
   - Update local `assignmentsBySection` only (for preview)
   - Open modal
   - **Do not** call `persistCalendarAssignments` until `applyMeetingPatternSelection` succeeds
2. On modal dismiss (Later / Close / X):
   - Revert `assignmentsBySection` for that section to pre-click state OR remove the draft section if it was create-flow only
3. On pattern apply success → persist once.

**Acceptance:** Close modal without choosing pattern → calendar matches pre-click state; backend unchanged.

---

## Task 2.4 — Context menu parity

**File:** `platform/app/calendar/page.tsx` — context menu lock/unlock entries

Ensure "Lock placement" / unlock actions invalidate any in-progress drag state.

**Acceptance:** Lock from context menu immediately prevents subsequent drag.

---

## Verification checklist

- [ ] Locked section: pointer down does not start drag
- [ ] Unlocked section: drag works as before
- [ ] New section click → modal → cancel → no backend ghost assignment
- [ ] Multi-day section drag → warning or pattern modal (per chosen option)
- [ ] Cross-list: locking one member blocks group drag

## Estimated effort

**Medium–High** — ~1–2 sessions. Task 2.3 is the trickiest.

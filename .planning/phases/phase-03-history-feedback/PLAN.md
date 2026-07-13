# Phase 3: History & Feedback Consistency

## Goal

Undo/redo, conflict highlights, and drag preview bands always reflect the true calendar state.

## Prerequisites

Phase 1 complete (`warning` status, `conflictSectionIds` from shared validator).

## Issues solved

- **C7** — Conflict highlights stale after undo (partially fixed; extend to full snapshot)
- **C8** — Snap duration vs highlight band mismatch
- **C6** (remainder) — Click placements not on undo stack

## Already done

- `computeCalendarDayConflicts` + undo/redo rescan via `conflictRescanNonce`

---

## Task 3.1 — Enrich undo snapshots

**File:** `platform/app/calendar/page.tsx`

Extend `UndoSnapshot`:

```ts
type UndoSnapshot = {
  key: string;
  assignmentsBySection: AssignmentMap;
  solverTimeslotIdsBySection: Record<string, string[]>;
  backendSaveMessage: ...;
  dragFeedback: CalendarDragFeedbackState;
  conflictSectionIds: string[]; // serialized from Set
};
```

1. Push full feedback state in `commitCalendarPlacement` (not just assignments).
2. `handleUndo` / `handleRedo`: restore `dragFeedback` + `conflictSectionIds` from snapshot directly.
3. Keep `computeCalendarDayConflicts` rescan as fallback when snapshot lacks feedback (older stack entries).

**Acceptance:** Undo immediately restores exact toast + rings from before the undone action.

---

## Task 3.2 — Push undo for click placements

**File:** `platform/app/calendar/page.tsx` — `commitPlacementByClick`

After successful placement (including post-pattern-apply from Phase 2):

1. Push same `UndoSnapshot` shape as drag path.
2. Align with Phase 2 defer-persist: push undo **before** persist, so undo reverts local + can skip backend write.

**Acceptance:** Click placement is undoable via navbar undo button.

---

## Task 3.3 — Unify snap and highlight durations

**Files:** `platform/app/calendar/page.tsx`

**Problem:** `dragPossibleTimeslots` (highlight bands) vs `selectSlotNearMinutes` (drop snap) use different duration sources.

**Fix:**

1. Extract `getAllowedSlotDurationsForDrag(sectionId, assignments, patterns, timeslotById): number[]`.
2. Use in both:
   - `dragPossibleTimeslots` memo
   - `selectSlotNearMinutes` call in `onPointerMove` / drop
3. When no slot matches pointer position, set transient feedback: "No compatible slot here for this section's meeting length."

**Acceptance:** Every highlighted band is a valid drop target; no silent preview freeze.

---

## Task 3.4 — Dismiss clears all conflict UI

**File:** `platform/app/calendar/page.tsx` — toast `onDismiss`

Already clears `conflictSectionIds`. Verify it also works for `warning` status after Phase 1.

**Acceptance:** X on toast removes rings and message.

---

## Verification checklist

- [ ] Drag conflict → undo → redo → same warning + highlights (snapshot path)
- [ ] Click place → undo → assignment reverted
- [ ] Drag over highlighted band → drop succeeds on that band
- [ ] Drag over non-highlighted gap → helpful message (not silent)

## Estimated effort

**Medium** — ~1 session.

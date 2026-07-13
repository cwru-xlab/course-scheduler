# Phase 4: Parity & Polish Summary

Closed the remaining calendar UX parity gaps: first-tap touch placement, removal
of the dead `dragError` feedback state, and editor-equivalent pre-validation
before the calendar's Run Solver.

## What changed

### Task 4.1 — Touch-friendly click-to-place (C9)

`platform/app/calendar/page.tsx` — the room-track `onClick` handler previously
only committed a placement when a hover `placementPreview` existed (set on
`pointermove`). On touch, a pure tap fires no `pointermove`, so nothing was
placed. The handler now falls back to computing the slot directly from the tap's
`e.clientX` via `minutesFromPointerInRoom` + `selectAnySlotNearMinutes`, so a
pending section places on the first tap. Desktop hover-preview flow is preserved.

### Task 4.2 — Simplify feedback state (C10)

`dragError` was only ever set to `null` (dead state). Removed the
`useState`, all `setDragError(null)` call sites, and the `dragError` prop on
`CalendarDragFeedbackToastPortal`. The toast now derives color/message solely
from `dragFeedback`, and the grid's error tint keys off
`dragFeedback.status === "invalid"`. Single, obvious feedback channel.

### Task 4.3 — Calendar solver pre-validation (C11)

`handleRunSolverFromCalendar` now calls `validateSchedulingInput(nextInput)`
before the `/api/schedule` POST — mirroring the editor's `SolverActionButton`.
On failure it stores a solver-error snapshot (with issue count + codes), fails
the progress indicator, sets a summary error, resets the run status, and routes
to `/solver-errors`. The existing lock-merge and save prompt are unchanged.

### Task 4.4 — Manual QA doc

Added `MANUAL_QA.md` with 5 regression scenarios (drag→warning→save→reload,
lock-blocked drag, pattern-modal cancel, undo/redo through conflict, calendar
solver bad-row validation) plus touch and feedback-channel parity checks.

## Verification

- `cd platform && npx tsc --noEmit` → PASS (no type errors).
- No remaining `dragError` / `setDragError` references in the calendar page.
- No linter errors on `platform/app/calendar/page.tsx`.

## Key files

- Modified: `platform/app/calendar/page.tsx`
- Created: `.planning/phases/phase-04-parity-polish/MANUAL_QA.md`
- Updated docs: `VERIFICATION.md`, `.planning/ISSUES.md` (C9–C11 → Done),
  `.planning/ROADMAP.md` (calendar Run Solver pre-validation criterion checked)

## Deviations from Plan

None — plan executed as written. `validateSchedulingInput` is run against the
lock-merged `nextInput` (the payload actually sent to the solver) rather than the
raw input, which is the most faithful pre-flight check.

## Self-Check: PASSED

- FOUND: `platform/app/calendar/page.tsx` (modified, tsc clean)
- FOUND: `.planning/phases/phase-04-parity-polish/MANUAL_QA.md`
- FOUND: `.planning/phases/phase-04-parity-polish/VERIFICATION.md`

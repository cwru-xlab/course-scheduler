# Phase 2 Verification

## Goal-backward checks

1. Locked sections cannot start a drag.
2. Pattern modal cancel does not leave persisted orphan assignments.
3. Multi-day pattern drag triggers modal or explicit warning (per PLAN decision).

## Manual tests

| # | Steps | Expected |
|---|-------|----------|
| 1 | Lock section in sidebar, try drag on calendar | No drag; message about unlock |
| 2 | Create new section, click slot, open pattern modal, close without selecting | No backend assignment; calendar reverts |
| 3 | Drag MWF section to new time on one day only | Pattern modal OR clear single-day warning |
| 4 | Unlock section, drag | Works normally |

## Automated

- [x] `cd platform && npx tsc --noEmit` — passes (exit 0) after implementation
- [x] Cursor TS language-service lint reports no errors on `platform/app/calendar/page.tsx`

## Execution notes (run 2026-07-12)

Primary file: `platform/app/calendar/page.tsx`. No new files created.

- **Task 2.1 — Block drag on locked sections:** `onPointerDown` now returns early when
  `placementLocked` is true (already computed per card, and true if *any* cross-list
  peer is locked). It clears any drag state and shows the invalid message
  "This section is locked for the solver. Unlock it in the schedule table to move it."
  No drag is started, so no move can commit.
- **Task 2.2 — Pattern-aware drag (Option B chosen):** Added
  `sectionHasMultiDayPattern(sectionId)` (true when `timeslot_ids.length > 1`, a single
  timeslot spans multiple days, or the assigned `meeting_pattern_id` spans multiple days).
  In `commitCalendarPlacement`, multi-day drags now surface a `warning`: "Only {day} was
  updated. This section uses a multi-day pattern — its other days are unchanged…" (appended
  to any conflict warning). **Option B was selected over Option A** because the drag path is
  local-only and would autosave the half-applied single-day move before a modal could
  complete, reintroducing the very orphan/desync problem the modal is meant to prevent.
  Option B satisfies the acceptance ("user is never left thinking all pattern days moved")
  without that regression risk. The full pattern-reselection modal remains available on the
  click-to-place flow (Task 2.3).
- **Task 2.3 — Defer persistence + revert on dismiss:** `commitPlacementByClick` now applies
  the placement to local `assignmentsBySection` only (for preview) and **no longer persists**
  when `needsPatternSelection`; persistence happens in `applyMeetingPatternSelection` (apply)
  instead. The modal state carries a pre-click snapshot (`revertAssignments`,
  `revertSolverTimeslots`). New `dismissMeetingPatternSelection` restores that snapshot,
  clears conflicts, re-arms `pendingPlacementSectionId`, and shows a neutral "Placement
  canceled" message. It is wired to the modal's Close, Later, and backdrop/`onClose` paths.
  Non-pattern single-day clicks persist immediately as before.
- **Task 2.4 — Context menu parity:** `togglePlacementLockForSection` now clears
  `calendarDrag` when it locks a group containing the in-progress drag's section;
  `lockAllPlacementChanges` clears `calendarDrag` when the dragged section becomes locked.
  A subsequent pointer sequence is blocked by Task 2.1's guard.

Manual tests in the table above require a running app and were not executed in this
headless run.

## Sign-off

Phase 2 complete when integrity flows cannot corrupt backend state without user intent.

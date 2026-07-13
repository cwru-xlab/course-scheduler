# Phase 4 — Manual QA Script

Step-by-step scenarios for verifying calendar placement, feedback, and solver
parity. Run against the calendar page (`/calendar`) with a loaded schedule.

## Setup

1. Start the platform dev server (`cd platform && npm run dev`).
2. Sign in and open `/calendar` with a schedule that has at least a few sections,
   rooms, timeslots, and one multi-day meeting pattern.
3. Confirm autosave is **off** for scenarios that exercise the save prompt
   (toggle in the editor/settings if applicable).

---

## Scenario 1 — Drag → warning → save → reload → placement persisted

1. Drag a section onto a room/timeslot that overlaps another section (room
   overlap or shared-instructor conflict).
2. **Expect:** placement is applied, the conflicting sections show red rings, and
   the feedback toast shows an amber warning message (not an error block).
3. Click **Save** to persist to the backend.
4. **Expect:** save success message; placement remains on the calendar.
5. Reload the page.
6. **Expect:** the moved section is still in its new room/timeslot after reload.

## Scenario 2 — Lock → attempt drag → blocked

1. In the schedule table, lock a section for the solver.
2. Return to the calendar and try to drag that locked section.
3. **Expect:** the drag does not start; a red/error toast explains the section is
   locked and must be unlocked in the schedule table.
4. Unlock the section, then drag again.
5. **Expect:** the drag now works normally.

## Scenario 3 — Create section → pattern modal → cancel → no orphan

1. Use **Add Section** to create a new section (enters pending-placement mode).
2. Click (or tap) an empty room/timeslot to place it.
3. **Expect:** the meeting-pattern selection modal opens.
4. Click **Cancel** / dismiss the modal.
5. **Expect:** the section is NOT left half-placed — the calendar reverts to the
   pre-placement state, no orphan single-day placement remains, and the backend
   is untouched (nothing persisted, undo stack unchanged).

## Scenario 4 — Undo/redo through conflict state

1. Create a conflict by dragging a section onto an occupied slot (Scenario 1).
2. Press **Undo**.
3. **Expect:** the section returns to its previous slot AND the conflict red
   rings / feedback toast restore to the prior state (no stale highlights).
4. Press **Redo**.
5. **Expect:** the conflicting placement and its highlights/messages reappear
   consistently.

## Scenario 5 — Run solver from calendar with bad spreadsheet row → validation error

1. Ensure the loaded data has a known bad row (e.g., a section referencing a
   missing room/instructor, or an invalid capacity/time value).
2. Click **Run Solver** on the calendar page (accept the save prompt if shown).
3. **Expect:** the run fails fast BEFORE the solver call — the app navigates to
   `/solver-errors` and shows the same row-anchored data issues the editor's Run
   Solver produces. The solver progress indicator does not stay spinning.
4. Fix the bad row, reload data, and run again.
5. **Expect:** validation passes and the solver runs normally.

---

## Touch / mobile parity (C9)

Run on a real touch device or emulated touch (Chrome DevTools device mode with
touch input):

1. **Tap-to-place:** Use **Add Section**, then tap a single empty room/timeslot
   cell once (no dragging, no hover).
   - **Expect:** the section places on the **first tap** (pattern modal opens for
     multi-day patterns; single-day sections place directly). It must not require
     a prior pointer move / hover.
2. **Tap on occupied/blocked slot:** tap a hard-blocked slot (blocked time or
   over-capacity).
   - **Expect:** an error toast; no placement applied.

## Feedback channel (C10)

1. Trigger valid, warning, and invalid placements in sequence.
2. **Expect:** exactly one feedback toast channel drives all messages
   (`dragFeedback`), with correct color per status (emerald/amber/red). There is
   no separate/duplicated error banner from a dead `dragError` path.

---

## Regression checklist

- [ ] Scenario 1: drag warning saves and persists across reload
- [ ] Scenario 2: locked section cannot be dragged
- [ ] Scenario 3: pattern modal cancel leaves no orphan
- [ ] Scenario 4: undo/redo restores conflict highlights
- [ ] Scenario 5: calendar Run Solver validates bad rows before running
- [ ] Touch: tap-to-place works on first tap (C9)
- [ ] Feedback: single toast channel, correct colors (C10)

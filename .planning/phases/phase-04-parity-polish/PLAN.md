# Phase 4: Parity & Polish

## Goal

Close remaining UX gaps: touch devices, dead state cleanup, calendar solver pre-validation.

## Prerequisites

Phases 1–3 complete.

## Issues solved

- **C9** — Touch tap may not set `placementPreview` before click
- **C10** — `dragError` mostly unused
- **C11** — Calendar run solver skips client `validateSchedulingInput`

---

## Task 4.1 — Touch-friendly click-to-place

**File:** `platform/app/calendar/page.tsx` — room track click handler

**Problem:** `placementPreview` set on `pointermove`; pure tap has no preview.

**Fix:**

1. On `pointerdown` / `click` on empty slot, compute slot from event coordinates directly (reuse `minutesFromPointerInRoom` + `selectSlotNearMinutes`).
2. If `pendingPlacementSectionId` set, call `commitPlacementByClick` without requiring prior hover preview.

**Acceptance:** Mobile tap on slot places pending section on first tap.

---

## Task 4.2 — Simplify feedback state

**File:** `platform/app/calendar/page.tsx`

1. Audit `dragError` usage — merge into `dragFeedback` or remove if always null.
2. Single toast source: `dragFeedback.message` only.
3. Update `CalendarDragFeedbackToastPortal` accordingly.

**Acceptance:** No dead state; one obvious feedback channel.

---

## Task 4.3 — Calendar solver pre-validation

**Files:**
- `platform/app/calendar/page.tsx` — `handleRunSolverFromCalendar`
- `platform/components/scheduler/SolverActionButton.tsx` (reference)

Before solver POST:

1. Call `validateSchedulingInput(data)` (same as editor).
2. On located issues → navigate to `/solver-errors` or show inline banner.
3. Keep existing lock merge + save prompt.

**Acceptance:** Calendar run solver fails fast with spreadsheet row errors like editor.

---

## Task 4.4 — Manual test script (document in VERIFICATION)

Add `.planning/phases/phase-04-parity-polish/MANUAL_QA.md` with step-by-step scenarios for QA.

**Scenarios:**

1. Drag → warning → save → reload → placement persisted
2. Lock → attempt drag → blocked
3. Create section → pattern modal → cancel → no orphan
4. Undo/redo through conflict state
5. Run solver from calendar with bad spreadsheet row → validation error

---

## Verification checklist

- [ ] iOS Safari / Chrome mobile: tap-to-place works
- [ ] No references to orphaned `dragError` setters
- [ ] Calendar solver validates before run
- [ ] Manual QA doc completed

## Estimated effort

**Low–Medium** — ~0.5–1 session.

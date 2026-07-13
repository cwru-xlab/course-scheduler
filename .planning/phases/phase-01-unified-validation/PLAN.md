# Phase 1: Unified Placement Validation

## Goal

Replace the three divergent validation paths (drag drop, click-to-place, pattern modal) with a single `evaluatePlacement` function that returns a consistent severity and message. Make **warning** placements saveable.

## Issues solved

- **C1** — Warning moves applied but `hasValidUnsavedEdit` blocks save (`dragFeedback.status === "valid"` only)
- **C2** — Drag vs click use different rules (room overlap, instructor conflict, capacity timing)

## Out of scope

- Meeting pattern modal deferral (Phase 2)
- Lock-on-drag (Phase 2)
- Undo snapshot changes (Phase 3)

---

## Task 1.1 — Extract shared validation module

**Create:** `platform/app/calendar/placementValidation.ts`

**Types:**

```ts
export type PlacementSeverity = "block" | "warn" | "ok";
export type PlacementReasonCode =
  | "blocked"
  | "capacity"
  | "room_conflict"
  | "instructor_conflict"
  | "missing_data";

export type PlacementEvaluation = {
  severity: PlacementSeverity;
  reasonCode: PlacementReasonCode | null;
  message: string;
  /** Section ids involved in a warn-level conflict (for highlighting). */
  conflictSectionIds: string[];
};
```

**Function signature:**

```ts
export function evaluatePlacement(input: {
  sectionId: string;
  targetRoomId: string;
  slot: TimeslotWithMinutes;
  selectedDay: Day;
  data: SchedulingInput;
  assignmentsBySection: AssignmentMap;
  allDayEvents: CalendarEvent[];
  linkedSectionIdsBySection: Map<string, string[]>;
  instructorById: Map<string, Instructor>;
  findBlockedPlacementMessage: (...) => string | null;
  /** If true, capacity is checked even when room unchanged (click path). Default: always. */
  alwaysCheckCapacity?: boolean;
}): PlacementEvaluation;
```

**Rules (single source of truth):**

| Check | Severity | Applies move? |
|-------|----------|---------------|
| Blocked time | `block` | No |
| Capacity exceeded | `block` | No |
| Room overlap (same room, overlapping time) | `warn` | Yes (drag already does; click should too) |
| Instructor double-booking (any room, overlapping time) | `warn` | Yes |

**Instructor conflict message format:**

```
Warning: {instructorName} already teaches {courseLabel} at {Day} {start}-{end}. Both classes highlighted for your review.
```

Use first conflicting event for course label; include all conflicting section ids in `conflictSectionIds`.

**Acceptance:** Unit-testable pure function; no React imports.

---

## Task 1.2 — Extend drag feedback status

**File:** `platform/app/calendar/page.tsx`

1. Change `CalendarDragFeedbackState.status` to `"neutral" | "valid" | "warning" | "invalid"`.
2. Map severities:
   - `block` → `invalid` (move not applied)
   - `warn` → `warning` (move applied)
   - `ok` → `valid`
3. Update `CalendarDragFeedbackToastPortal` to style `warning` like current invalid (amber/red) but label clearly as "Warning".

**Acceptance:** Toast shows "Warning" for instructor/room conflicts, "Error" for blocks.

---

## Task 1.3 — Wire drag path to shared validator

**File:** `platform/app/calendar/page.tsx` — `commitCalendarPlacement`

1. Replace inline conflict logic (~lines 2654–2725) with `evaluatePlacement`.
2. On `block`: revert assignment change (already partially done for blocked/capacity); set `invalid`.
3. On `warn`: keep applied move; set `warning`; set `conflictSectionIds` from evaluation.
4. On `ok`: set `valid`; clear `conflictSectionIds`.

**Acceptance:** Drag behavior unchanged visually except message wording; instructor message matches spec.

---

## Task 1.4 — Wire click path to shared validator

**File:** `platform/app/calendar/page.tsx` — `evaluatePlacement` callback + `commitPlacementByClick`

1. Delete duplicate `evaluatePlacement` useCallback (~2870–2936).
2. Import and use `placementValidation.evaluatePlacement`.
3. On `warn`: **apply** placement (change from current hard-block) + show warning + highlights — match drag semantics.
4. On `block`: reject as today.

**Acceptance:** Clicking into an instructor conflict applies move and shows same warning as drag.

---

## Task 1.5 — Make warnings saveable

**File:** `platform/app/calendar/page.tsx`

1. Update `hasValidUnsavedEdit`:

```ts
const hasValidUnsavedEdit = useMemo(() => {
  const changed = /* existing baseline diff */;
  const saveableStatus =
    dragFeedback.status === "valid" || dragFeedback.status === "warning";
  return changed && saveableStatus;
}, [...]);
```

2. Ensure Save button and `handleUpdateBackend` work when status is `warning`.
3. Autosave effect: same condition.

**Acceptance:** After instructor-conflict drag with autosave off, Save persists the placement.

---

## Task 1.6 — Wire pattern modal validation

**File:** `platform/app/calendar/page.tsx` — `validatePatternPlacement`

Refactor to call shared validator per pattern day/slot, or extract shared overlap helpers used by both.

**Acceptance:** Pattern selection uses same room/instructor conflict definitions.

---

## Verification checklist

- [ ] Drag room overlap → warning toast, red rings, Save enabled
- [ ] Drag instructor conflict → message matches instructor name + course + time format
- [ ] Click same slots → identical outcome to drag
- [ ] Blocked slot → no move, invalid toast, Save unchanged
- [ ] Capacity fail → no move, invalid toast
- [ ] `npx tsc --noEmit` in `platform/` passes

## Estimated effort

**Medium** — ~1 focused session. Highest ROI phase.

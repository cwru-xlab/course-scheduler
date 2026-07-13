# Phase 1 Verification

## Goal-backward checks

1. **Single validator exists** — `placementValidation.ts` exported and imported by drag + click paths.
2. **Severity mapping** — `block` / `warn` / `ok` map to `invalid` / `warning` / `valid` in UI.
3. **Saveable warnings** — `hasValidUnsavedEdit` true when status is `warning` and assignments changed.

## Manual tests

| # | Steps | Expected |
|---|-------|----------|
| 1 | Drag section onto another in same room/time | Warning toast, red rings, Save enabled |
| 2 | Drag section onto instructor's other class (different room) | Instructor warning message with name + course + time |
| 3 | Click same conflict slot | Same as drag |
| 4 | Drag to blocked time | No move, error toast |
| 5 | Drag over capacity | No move, error toast |
| 6 | Valid drag, autosave off, Save | Persists to backend |

## Automated

- [x] `cd platform && npx tsc --noEmit` — passes (exit 0) after implementation
- [ ] Optional: unit tests for `evaluatePlacement` in `placementValidation.test.ts` — not added (no test runner configured in `platform/`)

### Notes (execution run)

- `npx eslint` could not run: the repo's `platform/eslint.config.mjs` imports `@eslint/compat`, which is not installed (pre-existing, out of scope). Cursor's TS language-service lint reports no errors on the edited files.
- Goal-backward checks satisfied:
  - Single validator: `placementValidation.ts` exported and consumed by both the drag path (`commitCalendarPlacement`) and click path (`evaluatePlacement` wrapper + `commitPlacementByClick`).
  - Severity mapping: `block`→`invalid` (move rejected), `warn`→`warning` (move applied + highlights), `ok`→`valid`.
  - Saveable warnings: `hasValidUnsavedEdit` returns true for `warning` status when assignments changed; autosave effect shares the same condition.
  - No duplicate conflict logic remains in `page.tsx`; the inline drag/click conflict code was removed in favor of the shared module.
- Manual tests in the table above still require a running app and were not executed in this headless run.

## Sign-off

Phase 1 complete when all manual tests pass and no duplicate validation logic remains in `page.tsx`.

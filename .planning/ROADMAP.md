# Calendar Drag-and-Drop — GSD Roadmap

**Milestone:** Make calendar placement predictable, saveable, and transparent.  
**Primary file:** `platform/app/calendar/page.tsx`  
**Supporting files:** `platform/app/calendar/calendarEvents.ts`, `CrosslistCalendarEventCard.tsx`

## Guiding principle

> If it's on the calendar, the user can save it. If they can't save it, it shouldn't be on the calendar.

## Already completed (do not re-implement)

| Item | Status |
|------|--------|
| Instructor double-booking detection on drag | Done |
| Conflict section highlighting (red rings) | Done |
| Sidebar portal, slide animation, search filter | Done |
| Undo/redo conflict re-scan + highlights | Done |
| Navbar layout stability (grid center nav) | Done |

## Phase overview

| Phase | Name | Goal | Issues addressed |
|-------|------|------|------------------|
| 1 | Unified validation | One validation pipeline; warnings are saveable | C1, C2 |
| 2 | Placement integrity | Locks, patterns, and modal flow can't corrupt state | C3, C4, C5, C6 |
| 3 | History & feedback | Undo/redo and visual feedback stay in sync | C7, C8 |
| 4 | Parity & polish | Click/drag/solver paths feel the same | C9, C10, C11 |

## Dependency graph

```
Phase 1 (validation) ──► Phase 2 (integrity)
        │                        │
        └──────────┬─────────────┘
                   ▼
            Phase 3 (history)
                   │
                   ▼
            Phase 4 (polish)
```

Phase 1 is a hard prerequisite for Phase 2 (pattern modal and locks should call the shared validator). Phase 3 can start after Phase 1; Phase 4 is last.

## Success criteria (milestone)

- [ ] Drag and click-to-place use the same validation rules and severity levels
- [ ] Warning placements (room overlap, instructor conflict) can be saved when autosave is off
- [ ] Locked sections cannot be dragged without explicit unlock
- [ ] Multi-day pattern sections cannot be silently broken by drag
- [ ] Meeting-pattern modal cancel does not leave orphan single-day placements
- [ ] Undo/redo restores conflict highlights and messages when applicable
- [ ] Drag snap targets match visible highlight bands
- [x] Calendar "Run solver" runs the same pre-validation as the editor

## How to execute with GSD

For each phase:

1. `/gsd:plan-phase <N>` — runs researcher + planner (or use existing `PLAN.md`)
2. `/gsd:execute-phase <N>` — runs executor with atomic commits
3. `/gsd:verify-work <N>` — runs verifier against `VERIFICATION.md`

Phase folders: `.planning/phases/phase-0N-*/`

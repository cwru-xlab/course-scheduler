# Calendar Issues Index

Maps audit findings to GSD phases. Reference when scoping or verifying work.

| ID | Summary | Severity | Phase | Status |
|----|---------|----------|-------|--------|
| C1 | Warning moves not saveable (`hasValidUnsavedEdit` requires `valid`) | Critical | 1 | Open |
| C2 | Drag vs click validation rules differ | Critical | 1 | Open |
| C3 | Drag breaks multi-day meeting patterns silently | Critical | 2 | Done (warning, Option B) |
| C4 | Locked sections still draggable | High | 2 | Done |
| C5 | Pattern modal cancel leaves half-placed section | High | 2 | Done |
| C6 | Click persist immediate, no undo; drag local-only | High | 2, 3 | Partial (pattern persist deferred; full undo Phase 3) |
| C7 | Stale conflict highlights after undo | High | 3 | Partial (rescan added) |
| C8 | Snap vs highlight duration mismatch | Medium | 3 | Open |
| C9 | Touch tap may not place without pointermove | Medium | 4 | Done |
| C10 | `dragError` dead state | Low | 4 | Done |
| C11 | Calendar solver skips Check Data | Medium | 4 | Done |

## Completed (outside phases)

| Item | Notes |
|------|-------|
| Instructor conflict on drag | Warning + highlight |
| Sidebar UX | Portal, animation, search |
| Undo/redo conflict rescan | `computeCalendarDayConflicts` |
| Navbar shift fix | Grid layout |

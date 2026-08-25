---
status: resolved
trigger: "Implement Priority 1–3 production fixes: threaded Flask, Postgres shared state via solver API, soften 403s on allowlist timeouts, network failure messaging"
created: 2026-08-25T03:58:00Z
updated: 2026-08-25T04:10:00Z
symptoms_prefilled: true
goal: find_and_fix
---

## Current Focus

hypothesis: Process-local globalThis/.data + single-threaded Flask cause prod 502/403/sync failures; fix by threading + DB-backed solver endpoints + allowlist cache softening
test: Solver sync smoke + tsc --noEmit
expecting: All sync endpoints work; TS clean; concurrent /solve returns 409 while lock held
next_action: Finalize verification summary for parent

## Symptoms

expected: Concurrent users can poll access/data during solve; shared calendar/activity/lock consistent across Vercel replicas; transient solver timeouts don't cascade to 403 on saved-schedules
actual: Flask blocks all HTTP during /solve; shared state is process-local; read ETIMEDOUT /api/schedule 502; /api/saved-schedules 403; inconsistent multi-user sync
errors: read ETIMEDOUT, 502 on /api/schedule, 403 on /api/saved-schedules
reproduction: Multi-replica Vercel + long CP-SAT solve + concurrent users
started: Production under load / multi-user

## Eliminated

## Evidence

- timestamp: 2026-08-25T04:05:00Z
  checked: solver sync endpoints via test_client
  found: shared-schedule, activity, data-revision, solver-session acquire/409/cancel/finish all OK
  implication: DB-backed sync API works on sqlite local path

- timestamp: 2026-08-25T04:06:00Z
  checked: platform tsc --noEmit
  found: exit 0
  implication: async store rewiring typechecks

- timestamp: 2026-08-25T04:07:00Z
  checked: solve lock while holding _solve_request_lock
  found: /sync/shared-schedule 200; concurrent /solve 409 solver_busy
  implication: P1 serialization works; other HTTP not blocked by solve lock alone

## Resolution

root_cause: Flask single-threaded blocks HTTP during CP-SAT; cross-user sync uses process-local storage incompatible with Vercel replicas; allowlist treats transport errors as forbidden
fix: threaded=True + in-process solve lock; SQLAlchemy sync models/endpoints; Next.js stores via fetchSolver; stale allowlist grace; formatGuide network patterns; calendar first-load apply
verification: solver smoke + tsc passed; prod verify needs SOLVER_URL + DB_BACKEND=postgres deploy
files_changed:
  - solver/app.py
  - solver/model.py
  - solver/migrations/20260825_cross_user_sync.sql
  - platform/lib/shared-schedule.ts
  - platform/lib/activity-log.ts
  - platform/lib/scheduling/dataRevisionStore.ts
  - platform/lib/solver-session.ts
  - platform/lib/access-allowlist.ts
  - platform/lib/shared-schedule-client.ts
  - platform/lib/spreadsheet/formatGuide.ts
  - platform/lib/record-activity.ts
  - platform/app/api/shared-schedule/route.ts
  - platform/app/api/activity/route.ts
  - platform/app/api/solver-lock/route.ts
  - platform/app/api/schedule/route.ts
  - platform/app/api/data/route.ts
  - platform/app/api/saved-schedules/route.ts
  - platform/app/api/saved-schedules/[id]/route.ts
  - platform/app/calendar/page.tsx

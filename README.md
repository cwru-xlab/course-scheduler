## Weatherhead Course Scheduling Decision-Support System (v1)

## 1. Problem Statement (Engineer Version)

Weatherhead needs a scheduling system that assigns **rooms and time slots** to **predefined instructor–section pairs**, subject to a large number of institutional constraints and preferences. Existing tools fail because they hard-code logic, obscure tradeoffs, and cannot encode local “tribal knowledge.”

This system is explicitly **human-in-the-loop**:

* it must generate feasible and optimized schedules,
* allow partial manual overrides,
* re-optimize locally,
* and preserve rules across semesters.

This is a **constraint optimization** problem with transparency and editability as first-class requirements.

---

## 2. Explicit Non-Goals (Critical)

The system **does not**:

* assign instructors to courses,
* decide teaching loads,
* forecast enrollment,
* enforce HR or departmental policy beyond provided inputs.

Instructor–section pairings are **inputs**, not solver outputs.

---

## 3. High-Level Architecture

```
┌────────────┐
│   Frontend │  ← calendar, conflicts, overrides, comparisons
└─────┬──────┘
      │
┌─────▼──────┐
│ API Layer  │  ← validation, locking, scenario mgmt
└─────┬──────┘
      │
┌─────▼─────────────┐
│ Scheduling Engine │  ← constraint + optimization solver
└─────┬─────────────┘
      │
┌─────▼──────┐
│ Data Store │  ← sections, rooms, rules, schedules
└────────────┘
```

Solver should be isolated and callable with:

* inputs
* constraints
* locked decisions
  → returning solutions + scores + explanations.

---

## 4. Core Domain Model (Canonical)

### 4.1 Section (Primary Scheduling Unit)

```json
Section {
  id,
  course_id,
  section_code,
  instructor_id,          // fixed input
  expected_enrollment,
  enrollment_cap,
  allowed_meeting_patterns[],
  room_requirements,
  crosslist_group_id?,     // nullable
  tags[]                   // e.g. "upper_level_required"
}
```

> Sections are **atomic** — never merge them internally.

---

### 4.2 Instructor

```json
Instructor {
  id,
  rank_type,               // TT, Tenured, NTT, Adjunct
  unavailable_times[],     // hard constraints
  preferences {            // soft constraints
    preferred_days[],
    preferred_patterns[],
    max_teaching_days?
  }
}
```

---

### 4.3 Room

```json
Room {
  id,
  building,
  capacity,
  features[]
}
```

---

### 4.4 Timeslot (University Grid)

```json
Timeslot {
  id,
  day,
  start_time,
  end_time
}
```

---

### 4.5 MeetingPattern

```json
MeetingPattern {
  id,
  slots_required,
  allowed_days[],
  compatible_timeslot_sets[]
}
```

MeetingPatterns define **how many slots** and **which combinations** are valid.

---

## 5. Constraint Abstractions (Do Not Hard-Code)

### 5.1 CrossListGroup (Key Design)

```json
CrossListGroup {
  id,
  member_section_ids[]
}
```

Rules:

* all members share **identical timeslot set**
* room capacity must satisfy **sum of enrollments**
* all members share the **same room** (always)

---

### 5.2 NoOverlapGroup

```json
NoOverlapGroup {
  id,
  member_section_ids[],
  reason
}
```

Members must not overlap in time.

---

### 5.3 BlockedTime

```json
BlockedTime {
  scope,                   // global | instructor | room | program
  timeslot_ids[],
  reason
}
```

---

## 6. Constraint Classification

### 6.1 Hard Constraints (Must Always Hold)

* instructor cannot teach two sections simultaneously
* room cannot host multiple sections simultaneously
* times must align to university grid
* room capacity ≥ enrollment (or cross-list total)
* room features must satisfy section requirements
* blocked times forbidden
* cross-listed sections share time
* no-overlap groups do not overlap
* program caps (e.g., upper-level required per day)

Violation = infeasible.

---

### 6.2 Soft Constraints (Penalized)

* instructor day/pattern preferences
* adjunct teaching days ≤ 2 (penalty beyond)
* diversify meeting times across sections
* room size mismatch
* balance required courses across weekdays

Each soft constraint must be:

* measurable
* weightable
* explainable

---

## 7. Solver Model (Implementation Guidance)

### Decision Variables

For each **Section**:

* meeting pattern ∈ allowed patterns
* timeslot set ∈ compatible sets
* room ∈ available rooms

Instructor is fixed.

---

### Objective

Minimize total penalty:

```
Σ instructor_preference_penalties
+ Σ room_fit_penalties
+ Σ section_clustering_penalties
+ Σ program_balance_penalties
```

Hard constraints enforced strictly.

Room-fit is not a raw per-seat waste penalty: assignments get a free-fit buffer
of `max(ROOM_FIT_BUFFER_FLOOR, ROOM_FIT_RATIO × required_capacity)` seats (see
`ROOM_FIT_RATIO` / `ROOM_FIT_BUFFER_FLOOR` in `solver/app.py`), and only wasted
seats beyond that buffer are penalized. This prevents the solver from avoiding
all larger rooms purely because of linear per-seat waste.

---

### Required Solver Capabilities

* discrete assignment
* equality constraints (cross-listing)
* counting constraints (per day, per program)
* weighted soft constraints
* partial locking

⚠️ Do **not** roll your own solver. Use CP-SAT / constraint programming.

---

## 8. Partial Locking (Mandatory Feature)

System must support:

```json
LockedAssignment {
  section_id,
  fixed_timeslot_set?,
  fixed_room?
}
```

Locked decisions:

* are treated as constants
* reduce solver search space
* allow local re-optimization

This is critical for human usability.

---

## 9. Outputs

Solver returns:

```json
ScheduleSolution {
  assignments[],
  total_score,
  penalty_breakdown,
  explanations[]
}
```

Where explanations are human-readable:

> “Section X scheduled Tue/Thu 10:30 due to instructor preference and no-overlap constraints.”

---

## 10. Validation Layer (Before Solver Runs)

Must detect:

* impossible cross-lists (capacity mismatch)
* instructors unavailable for all allowed patterns
* no feasible room exists
* conflicting hard constraints

Fail fast with actionable errors.

---

## 11. Implementation Phases (Engineer-Friendly)

### Phase 1 — Feasibility Engine

* hard constraints only
* generate *any* valid schedule or fail with reason

### Phase 2 — Optimization

* add soft constraints
* scoring + ranking
* multiple candidate solutions

### Phase 3 — Interactive

* locking
* partial re-solve
* scenario comparison

---

## 12. Key Engineering Principles (Non-Negotiable)

* constraints stored as **data**, not code
* solver isolated from UI logic
* explainability required
* no assumption that rules are permanent
* schema must survive future semesters

---

## 13. One-Paragraph Summary

> This system schedules rooms and times for predefined instructor–section pairs using a constraint-based optimization approach. Sections are the atomic units; cross-listed courses are independent sections bound by shared scheduling decisions. Hard constraints ensure feasibility, soft constraints express preferences via penalties, and all logic is explicit, inspectable, and overrideable. The solver must support partial locking and explanation generation, enabling a human-centered workflow rather than full automation.

---

## 14. End-to-End Functional Runthrough

This repo is a two-service system:

- **Frontend (Next.js)**: lets users edit scheduling inputs, run the solver, and interact with the resulting schedule (calendar drag/drop, PDF export, and notes).
- **Solver (Flask + OR-Tools CP-SAT)**: stores scheduling data in SQLite, validates inputs, and produces schedule assignments.

### 14.1 Frontend navigation (what exists in the UI)

The main routes exposed by the frontend:

- `/` redirects to `/editor/sections`
- `/editor/*` (data entry tables)
  - `/editor/sections`
  - `/editor/instructors`
  - `/editor/rooms`
  - `/editor/timeslots`
  - `/editor/meeting-patterns`
  - `/editor/constraints` (cross-list groups, no-overlap groups, blocked times, locked assignments, soft locks)
- `/calendar` (schedule output + manual adjustments)
- `/notes` (row notes and replies)
- `/solver-errors` (last solver failure diagnostics)

The navbar also links to:

- `Editor` (dropdown with the `/editor/*` pages)
- `Calendar`
- `Notes Feed`

### 14.2 Editing scheduling inputs (`/editor/*`)

Each editor page follows the same high-level flow:

1. UI loads current scheduling data from the backend via `GET /api/data`.
2. UI renders an editable table for a specific slice of scheduling input.
3. Clicking **`Update Backend`** sends the *entire* current scheduling dataset to `POST /api/update-all`.
4. `POST /api/update-all` calls multiple solver endpoints (replace rows in SQLite).
5. The editor page calls `GET /api/data` again (`reloadFromBackend`) to refresh the UI.

Each editor page also provides:

- **Spreadsheet import/export** (`Import Spreadsheet`, `Export Spreadsheet`) on the current `SchedulingInput`.
- **Run Solver** (`Run Solver`) which schedules and navigates to `/calendar`.

#### What gets updated in the solver DB?

Solver update endpoints are **replace-all** semantics:

- `/update-sections` clears and replaces the `sections` table
- `/update-instructors` clears and replaces the `instructors` table
- `/update-rooms` clears and replaces the `rooms` table
- `/update-timeslots` clears and replaces the `timeslots` table
- `/update-meeting-patterns` clears and replaces the `meeting_patterns` table
- `/update-constraints` clears and replaces all constraint tables:
  - `crosslist_groups`
  - `no_overlap_groups`
  - `blocked_times`
  - `locked_assignments`
  - `soft_locks`

### 14.3 Running the solver (`Run Solver`)

Clicking **`Run Solver`**:

1. Frontend calls `POST /api/schedule` with the current `SchedulingInput`.
2. `POST /api/schedule` forwards the solver request as `POST ${SOLVER_URL}/solve` with payload `{ "input": SchedulingInput }`.
3. If the solver succeeds, the response includes assignments + penalty details and frontend navigates to `/calendar`.
4. If the solver fails, the frontend stores a snapshot of:
   - the input that failed
   - `errors`
   - `diagnostics` (when provided)
   in `localStorage`, then navigates to `/solver-errors`.

Important UX warning:

- `/calendar` manual adjustments can be overwritten by a subsequent solver run. This is explicitly called out in the Run Solver confirmation dialog.

### 14.4 Output calendar (`/calendar`) and manual edits

After a successful solver run, the calendar renders a Monday–Friday grid:

- Rows = **rooms**
- Columns = **time slots**
- Each scheduled **section** is drawn as an “event” on its chosen room + time.

#### Calendar features in detail

1. **Day switching (Mon–Fri)**: the calendar filters events/timeslots for the selected day.
2. **Drag preview + pointer-driven snapping**:
   - Dragging is pointer-driven and snaps to available timeslots for the selected day.
   - Long/long-block timeslots are visually distinguished based on `timeslot.slot_type`.
3. **Immediate client-side validation feedback**:
   When you drag a section to a room + time, the UI checks:
   - **Room capacity** against the section’s `enrollment_cap` (fallback to `expected_enrollment`).
   - **Room-time conflicts**: it only checks overlap with other events in the *same target room* on the same day.

   If any conflicts are found, the drag feedback turns invalid and shows a short conflict list.

   Note: the client-side check is room/time overlap only; other solver constraints (e.g., instructor conflicts, cross-list rules) are not fully validated until you run the solver.
4. **Undo stack**:
   - Manual drag commits are pushable into an undo stack (up to 25 snapshots).
   - “Undo” restores the previous manual state (assignments and drag feedback state).
5. **Update Backend (persist manual edits)**:
   - If the current manual edit differs from the solver baseline and is “valid”, the **`Update Backend`** button becomes enabled.
   - Clicking it calls `POST /api/update-sections` to persist the manual placement back into the solver DB.

#### What does “persist manual edits” actually write?

On save, the frontend merges current editor sections with:

- `room_id`: from the calendar assignment state
- `timeslot_id`: from the calendar assignment state **using only the first element** of `timeslot_ids` (`timeslot_ids[0]`)

This means:

- If a meeting pattern spans multiple timeslots, the calendar persistence mechanism currently only persists the first timeslot id.
- Re-running the solver may re-align (or overwrite) the multi-slot structure based on meeting pattern constraints.

### 14.5 Solver error page (`/solver-errors`)

If solver execution fails, the frontend:

- Stores the last failure snapshot in `localStorage` under `wsom-last-solver-error`.
- `/solver-errors` reads that snapshot and displays:
  - returned `errors` (a list of `{ code, message }`)
  - `diagnostics` (when present)

Diagnostics shown in the UI can include:

- `feasible_if_relax` (human-readable suggestions)
- `feasible_if_remove_section` (human-readable suggestions)
- `error_codes`
- `referenced_sections`
- `sections_exceeding_room_capacity`
- `most_constrained_sections`
- `busiest_instructors`

### 14.6 Notes feed (`/notes`) and row notes modal

Notes are implemented entirely on the client using `localStorage`:

- Each row’s notes are stored under keys like:
  - `wsom-row-notes::<scope>::<rowId>`
- Notes support:
  - notes
  - replies
  - completion checkbox (per note)
  - deletion
- The `/editor/*` pages show a “View Notes” button per row. Opening it uses a modal.

The notes modal also supports deep links:

- The editor pages can open `/editor/*?openRowNotes=1&noteScope=...&noteRow=...&focusNote=...`
- The modal then auto-scrolls to the requested note/reply.

These notes are **not persisted to the solver backend**.

### 14.7 MBAP manual scheduling workflow

MBAP courses use a **manual-first** workflow: exclude them from auto-solve, place them on the calendar by hand, then hard-lock before re-running the solver for other programs.

#### Section numbers and modalities

| `section_number` | Modality | Calendar placement |
|------------------|----------|-------------------|
| `400` | On-campus | Monday room grid (6:15–7:45 PM or 8:00–9:30 PM) |
| `800`–`899` | Online | Online band (Tuesday or Wednesday evening) |

SOC import derives `section_number` from `section_code` (e.g. `400-LEC` → `400`) and tags MBAP rows with `mbap`. SOC `Session` maps to `semester_length` (`full`, `half_any`, `first_half`, `second_half`). Legacy `half-1` / `half-2` tags are still read on spreadsheet import when `duration` is missing.

#### Half-semester terms and room sharing

| `semester_length` value | Meaning | Room/instructor conflicts |
|-------------------------|---------|---------------------------|
| `full` | Full semester | Conflicts with all other terms at same time |
| `first_half` | 1st half only | May share room/time with `second_half` only |
| `second_half` | 2nd half only | May share room/time with `first_half` only |
| `half_any` | Either half (solver/user picks) | Conflicts until resolved via `assigned_half` |

When a `half_any` section is placed on the calendar, choose 1st or 2nd half in the placement modal. The resolved value is stored as `assigned_half` on the section row and survives reload/export.

Spreadsheet `Sections` sheet columns include `duration` and optional `assigned_half` (for `half_any` only). Allowed values match the table above; import normalizes aliases like `half`, `1st half`, `h1`.

#### Required timeslots and meeting patterns

Create these in **Editor → Timeslots** and **Editor → Meeting Patterns** (IDs must match):

| ID | Day | Time | Pattern ID |
|----|-----|------|------------|
| `Mon_1815_1945` | Mon | 18:15–19:45 | `mbap_mon_615` |
| `Mon_2000_2130` | Mon | 20:00–21:30 | `mbap_mon_800` |
| `Tue_1800_2100` | Tue | 18:00–21:00 | `mbap_tue_eve` |
| `Wed_1800_2100` | Wed | 18:00–21:00 | `mbap_wed_eve` |

Constants are defined in `platform/lib/scheduling/mbapConstants.ts` and `solver/mbap_constants.py`. SOC import applies the matching `allowed_meeting_patterns` when MBAP sections are detected.

#### Recommended workflow

1. Import or edit data; confirm MBAP sections have `section_number` 400 or 800–899 and tag `mbap`.
2. In **Editor → Sections**, click **Archive MBAP** (or **Archive by tag…**) to exclude MBAP from the solver.
3. **Run Solver** for the remaining schedule.
4. On **Calendar**, filter the queue by tag `mbap` (Archived tab).
5. Place **400** sections on **Monday** in a room; place **800** sections in the **Online** band on Tue/Wed.
6. **Hard-lock** placed MBAP sections before any subsequent solver run.
7. **Update Backend** to persist manual placements.

Instructor conflict warnings apply across both the room grid and Online band. For half-semester sections, room warnings respect `semester_length` and `assigned_half` — `first_half` and `second_half` may share a room at the same weekly time.

#### Production database migration

Before deploying code that uses half-semester duration, run on the production Postgres database:

```sql
ALTER TABLE sections ADD COLUMN IF NOT EXISTS semester_length VARCHAR(32) NOT NULL DEFAULT 'full';
ALTER TABLE sections ADD COLUMN IF NOT EXISTS assigned_half VARCHAR(16);
```

Existing sections default to `full` with no assigned half. Then **restart/redeploy the solver** so startup migrations can verify the schema.

See `solver/migrations/20260831_sections_semester_length.sql` and `solver/migrations/20260830_sections_assigned_half.sql`.

---

## 15. Canonical Scheduling Input Model (Frontend + Solver)

The frontend uses `SchedulingInput` (see `platform/lib/scheduling/types.ts`) as the single contract object passed into:

- `POST /api/schedule`
- `POST /api/export-scheduling-spreadsheet`
- spreadsheet import/export
- `POST /api/update-all`

### 15.1 `SchedulingInput` (top-level)

`SchedulingInput` has these arrays:

- `sections[]`
- `instructors[]`
- `rooms[]`
- `timeslots[]`
- `meeting_patterns[]`
- `crosslist_groups[]`
- `no_overlap_groups[]`
- `blocked_times[]`
- `locked_assignments[]`
- `soft_locks[]`

#### Important: solver may accept additional fields

The solver’s `SchedulingInput` wrapper (in `solver/app.py`) also reads additional keys like `courses`, `majors`, and various preference structures.

The current frontend `SchedulingInput` type does not populate these extra keys, so they are effectively “optional/ignored by UI” today.

### 15.2 Entity field semantics

Below is the meaning of fields as used by the scheduling system:

- `sections[]`
  - `allowed_meeting_patterns`: ids of `meeting_patterns` this section is allowed to use
  - `room_requirements[]`: room feature names that must be present on the assigned room
  - `crosslist_group_id`: cross-list grouping id (bindings are enforced by constraints)
  - `tags[]`: used for UI coloring and may be used by solver extensions
  - `semester_length`: `full`, `half_any`, `first_half`, or `second_half` (spreadsheet column `duration`)
  - `assigned_half`: resolved half (`first_half` or `second_half`) for `half_any` sections after calendar placement or solver output
  - `timeslot_ids[]`: all meeting timeslot IDs for a section (legacy `timeslot_id` is the first element)
- `instructors[]`
  - `unavailable_times[]`: hard constraints against time ids
  - `preferences.preferred_days[]` / `preferences.preferred_patterns[]`: soft constraints for the objective
  - `preferences.max_teaching_days`: soft penalty beyond this for adjuncts
- `rooms[]`
  - `features[]`: must satisfy all `room_requirements`
  - `capacity`: used as a feasibility check for room assignment
- `timeslots[]`
  - `day`, `start_time`, `end_time`: define the grid + exact time alignment
  - `slot_type`: used by the UI to distinguish “short” vs “long” rendering; solver also uses it during option building
- `meeting_patterns[]`
  - `slots_required`: how many timeslots are required for the meeting pattern option
  - `allowed_days[]`: which day tokens the pattern allows
  - `compatible_timeslot_sets[]`: **a list of alternatives**, where each alternative is an array of timeslot ids that the meeting consumes
- `crosslist_groups[]`
  - `member_section_ids[]`: which sections are cross-listed together
  - cross-listed sections always share the same room and timeslot set
- `no_overlap_groups[]`
  - `member_section_ids[]`: sections that must not overlap
  - `reason`: human label for why the group exists
- `blocked_times[]`
  - `scope`: one of `global | instructor | room | program`
  - `timeslot_ids[]`: timeslot ids to block
  - `reason`: human label

  Note: in the current solver code, only `scope="global"` is applied during option generation (see solver design notes in `solver/app.py`).
- `locked_assignments[]`
  - `fixed_timeslot_set[]`: locks the exact timeslot-set alternative
  - `fixed_room`: locks room assignment

  Locked assignments reduce search space and are treated as constants.
- `soft_locks[]`
  - `preferred_timeslot_set[]` and/or `preferred_room`
  - `weight`: larger weights add stronger objective penalties when the preferred selection is not matched

### 15.3 Scheduling output (`ScheduleSolution`)

On success, solver returns `ScheduleSolution` with:

- `assignments[]`
  - `section_id`
  - `meeting_pattern_id`
  - `timeslot_ids[]`
  - `room_id`
  - `assigned_half`: optional; set for `half_any` sections when the solver or calendar resolves the half
- `total_score` (objective value)
- `penalty_breakdown` (per-category numeric totals)
- `explanations[]` (human-readable strings)

---

## 16. Spreadsheet Contract (Import/Export)

The Excel workbook format is the interchange schema for the UI’s `SchedulingInput`.

Contract file: `solver/spreadsheet_io/README.md`.

### 16.1 Delimiters (how lists are encoded)

- Simple list fields use `;` separators.
  - Example: `TS-M-0900;TS-W-0900`
- Nested list fields (`compatible_timeslot_sets`) use:
  - `;` between set alternatives
  - `|` between ids inside a set
  - Example: `TS-M-0900|TS-W-0900;TS-M-1030|TS-W-1030`

### 16.2 Required sheets and columns

The workbook must include these sheets and columns:

- `Sections`
  - `id`, `course_id`, `department`, `section_code`, `instructor_id`,
    `expected_enrollment`, `enrollment_cap`, `allowed_meeting_patterns`,
    `room_requirements`, `crosslist_group_id`, `tags`, `previous_meeting_pattern`
- `Instructors`
  - `id`, `name`, `rank_type`, `unavailable_times`, `preferred_days`,
    `preferred_patterns`, `max_teaching_days`
- `Rooms`
  - `id`, `building`, `room_number`, `capacity`, `features`
- `Timeslots`
  - `id`, `day`, `start_time`, `end_time`, `slot_type`
- `MeetingPatterns`
  - `id`, `slots_required`, `allowed_days`, `compatible_timeslot_sets`
- `CrosslistGroups`
  - `id`, `member_section_ids`
- `NoOverlapGroups`
  - `id`, `member_section_ids`, `reason`
- `BlockedTimes`
  - `scope`, `timeslot_ids`, `reason`
- `LockedAssignments`
  - `section_id`, `fixed_timeslot_set`, `fixed_room`
- `SoftLocks`
  - `section_id`, `preferred_timeslot_set`, `preferred_room`, `weight`

### 16.3 Template generation

To generate a fresh template workbook:

- `GET /api/scheduling-spreadsheet-template` (frontend route)
  - internally calls solver `GET /scheduling-spreadsheet-template`
- or directly use solver `GET /scheduling-spreadsheet-template`

---

## 17. API Reference (Frontend Proxies + Flask Solver)

The frontend exposes a set of Next.js routes under `/api/*`. These are thin proxy handlers around the solver Flask service under `${SOLVER_URL}`.

### 17.1 Frontend routes (Next.js)

#### `GET /api/data`

Response:

```json
{
  "status": "ok",
  "data": {
    "sections": [],
    "instructors": [],
    "rooms": [],
    "timeslots": [],
    "meeting_patterns": [],
    "crosslist_groups": [],
    "no_overlap_groups": [],
    "blocked_times": [],
    "locked_assignments": [],
    "soft_locks": []
  }
}
```

Failure:

```json
{
  "status": "error",
  "errors": [{ "code": "read_failed", "message": "..." }]
}
```

#### `POST /api/schedule`

Request body:

- expects a `SchedulingInput` object (the frontend sends the request JSON as-is)

Response on success:

```json
{
  "status": "ok",
  "assignments": [],
  "total_score": 123,
  "penalty_breakdown": { "...": 0 },
  "explanations": ["..."]
}
```

Response on failure:

```json
{
  "status": "error",
  "errors": [{ "code": "infeasible", "message": "No feasible schedule found." }],
  "diagnostics": { "feasible_if_relax": [], "feasible_if_remove_section": [] }
}
```

#### `POST /api/update-all`

Request body:

- typically the full `SchedulingInput` object from the editor page (but only the arrays are extracted)

Semantics:

- calls the solver update endpoints in this order:
  1. `/update-sections`
  2. `/update-instructors`
  3. `/update-rooms`
  4. `/update-timeslots`
  5. `/update-meeting-patterns`
  6. `/update-constraints`

Response:

```json
{ "status": "ok", "warnings": ["..."] }
```

On failure:

```json
{
  "status": "error",
  "errors": [{ "code": "invalid_request", "message": "..." }]
}
```

#### `POST /api/update-sections`

Used by the calendar to persist manual edits.

Request body:

```json
{ "sections": [ /* array of Section objects */ ] }
```

Response:

```json
{ "status": "ok" }
```

#### `POST /api/import-scheduling-spreadsheet`

Request:

- `multipart/form-data` with a file in the form field `file`

Response on success:

```json
{
  "status": "ok",
  "scheduling_input": { /* SchedulingInput object */ }
}
```

Response on failure:

```json
{ "status": "error", "errors": [{ "code": "parse_failed", "message": "..." }] }
```

#### `POST /api/export-scheduling-spreadsheet`

Request body:

```json
{ "input": { /* SchedulingInput object */ } }
```

Response:

- returns `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` bytes

#### `GET /api/scheduling-spreadsheet-template`

Response:

- returns xlsx bytes for the scheduling template

#### `GET /api/mock-data`

Returns a mock `SchedulingInput` for UI/testing.

### 17.2 Solver routes (Flask)

All solver routes are rooted under `${SOLVER_URL}`.

The solver service runs by default on:

- `http://localhost:5001`

It uses SQLite:

- `sqlite:///course_scheduler.db`

#### `GET /` (health)

Returns:

```json
{ "service": "weather-solver", "status": "ok" }
```

#### `GET /data`

Response:

- `status: ok`
- `data` in SchedulingInput shape (sections/instructors/rooms/timeslots/meeting_patterns/constraints)

#### `POST /solve`

Request body:

```json
{ "input": { /* SchedulingInput */ } }
```

Success response:

```json
{
  "status": "ok",
  "assignments": [
    {
      "section_id": "SEC-1",
      "meeting_pattern_id": "MP-1",
      "timeslot_ids": ["TS-1", "TS-2"],
      "room_id": "ROOM-1"
    }
  ],
  "total_score": 0,
  "penalty_breakdown": { "...": 0 },
  "explanations": ["..."]
}
```

Failure response:

```json
{
  "status": "error",
  "errors": [{ "code": "infeasible", "message": "No feasible schedule found." }],
  "diagnostics": {
    "feasible_if_relax": [],
    "feasible_if_remove_section": [],
    "error_codes": [],
    "referenced_sections": []
  }
}
```

#### Spreadsheet routes

`GET /scheduling-spreadsheet-template`

- returns xlsx bytes

`POST /import-scheduling-spreadsheet`

- `multipart/form-data` with `file`
- returns `{ "status": "ok", "scheduling_input": SchedulingInput }`

`POST /export-scheduling-spreadsheet`

- accepts either:
  - a raw SchedulingInput JSON object
  - or `{ "input": SchedulingInput }`
- returns xlsx bytes

#### Data update routes

All update routes are replace-all semantics:

`POST /update-sections`

- request:

```json
{ "sections": [ /* Section objects */ ] }
```

- response:

```json
{
  "status": "ok",
  "skipped_sections": [
    { "id": "SEC-1", "missing_required_fields": ["..."] }
  ]
}
```

Required keys for each section payload in `/update-sections`:

- `id`, `course_id`, `section_code`, `instructor_id`

If duplicates exist, solver skips duplicates and returns them in `skipped_sections`.

`POST /update-instructors`, `/update-rooms`, `/update-timeslots`, `/update-meeting-patterns`

- each expects `{ "instructors": [...] }`, `{ "rooms": [...] }`, etc.

`POST /update-constraints`

- expects:

```json
{
  "crosslist_groups": [],
  "no_overlap_groups": [],
  "blocked_times": [],
  "locked_assignments": [],
  "soft_locks": []
}
```

#### Optional solver Excel import (not used by the UI)

Solver also has `POST /import-excel`, which depends on optional excel importer modules.

If those modules are missing, the solver responds with `excel_import_unavailable` and HTTP `501`.

---

## 18. Error Handling and Diagnostics (What you’ll see)

There are two broad failure modes:

1. **Input validation / parsing failures**
   - import endpoints return `status: error` with `errors[]`
   - update endpoints return `status: error` (usually with `invalid_request` or `update_failed`)
2. **Scheduling infeasibility**
   - `/solve` returns:
     - `status: error`
     - `errors: [{ code: "infeasible", message: "No feasible schedule found." }]`
     - plus `diagnostics` (including relaxation/remove suggestions)

Frontend always expects `errors` as an array of `{ code, message }`.

---

## 19. Requirements, Setup, and How to Run

### 19.1 Solver requirements

- Python >= 3.12
- Dependencies (from `solver/pyproject.toml`):
  - `flask`
  - `flask-sqlalchemy`
  - `flask-cors`
  - `openpyxl`
  - `ortools`

Run:

- `cd solver`
- `python -m pip install flask flask-sqlalchemy flask-cors openpyxl ortools`
- `python app.py`

The solver listens on:

- `http://0.0.0.0:5001`

On first run, it will:

- create the SQLite DB (`course_scheduler.db`) if missing
- attempt to create required tables
- seed timeslots/meeting patterns/instructors (and room-related data) if the DB is empty

### 19.2 Frontend requirements

- Node.js (the Dockerfile uses `node:24-alpine`)
- Next.js + React + TypeScript (see `platform/package.json`)

Run:

- `cd platform`
- `npm install`
- `npm run dev`

The Dockerfile exposes port `3002` (for the production image).

### 19.3 Environment variables

Frontend needs to know how to reach the solver:

- `SOLVER_URL` (used by the Next.js server-side proxy routes)
  - defaults to `http://localhost:5001` in most routes
  - some routes include fallback to `http://localhost:8000`

Auth variables (used for CWRU SSO login — see section 19.4):

- `APP_BASE_URL` — base URL of this app, used to build the CWRU SSO callback.
  - Dev: `http://localhost:3000`
  - Prod: `https://course-scheduler.xlab-cwru.com` (or whatever your deploy hostname is — it must be pre-registered with CWRU UTech)
- `JWT_SECRET` — 32+ random bytes used to sign session JWTs. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Rotating this invalidates all sessions.

Copy `platform/.env.example` to `platform/.env.local` and fill these in before running `npm run dev`.

Optional environment variables exist for the LLM integration library, but the current UI you see here uses notes stored in `localStorage` (not an LLM-backed system).

### 19.4 Auth (CWRU SSO)

The entire site is gated behind CWRU SSO via `platform/middleware.ts`. Flow:

1. Unauthenticated request → redirected to `/login`.
2. `/login` shows a "Sign in with CWRU SSO" button that redirects to `https://login.case.edu/cas/login`.
3. CWRU redirects back to `/api/auth/cwru-sso-callback?ticket=...`. The callback server-validates the ticket, signs a JWT, and sets an `auth-token` HTTP-only cookie.
4. Middleware verifies the cookie on every request; the user menu in the top-right shows who is signed in.

**Local development**: CWRU CAS cannot redirect to `http://localhost`, so when the browser hostname is `localhost`/`127.0.0.1` AND `NODE_ENV !== "production"`, `/login` also renders a "Dev one-click login" button that issues a placeholder JWT via `POST /api/auth/dev-login`. That endpoint returns 404 on any non-localhost Host header or in production — safe to ship.

No database: identity from CAS is signed directly into the JWT. See `CWRU_SSO_INTEGRATION.md` for the protocol spec.

---

## 20. Practical Troubleshooting

- Solver won’t start:
  - ensure you installed OR-Tools (`ortools`) and are using Python >= 3.12
  - confirm you can import dependencies from the `solver` environment
- Calendar drag feels too permissive:
  - remember the client-side validation checks only room/time overlap and room capacity; the solver enforces instructor overlap, blocked times, crosslists, etc.
- Solver errors without “what to change”:
  - open `/solver-errors`; use `diagnostics.feasible_if_relax` and/or `diagnostics.feasible_if_remove_section` if present
- Spreadsheet import fails:
  - ensure your workbook includes all required sheets and column names from `solver/spreadsheet_io/README.md`
  - check delimiter encoding rules for `allowed_meeting_patterns`, `compatible_timeslot_sets`, `member_section_ids`, etc.


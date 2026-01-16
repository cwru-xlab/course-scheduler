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
  member_section_ids[],
  require_same_room: boolean
}
```

Rules:

* all members share **identical timeslot set**
* room capacity must satisfy **sum of enrollments**
* room equality enforced only if `require_same_room = true`

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
+ Σ room_waste_penalties
+ Σ section_clustering_penalties
+ Σ program_balance_penalties
```

Hard constraints enforced strictly.

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

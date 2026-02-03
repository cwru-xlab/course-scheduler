from typing import Dict, List, Optional, Tuple

from fastapi import FastAPI
from ortools.sat.python import cp_model
from pydantic import BaseModel

app = FastAPI()

ROOM_WASTE_WEIGHT = 1  # penalty per empty seat in assigned room
PREF_DAY_WEIGHT = 10  # penalty if assigned days don't match instructor preferences
PREF_PATTERN_WEIGHT = 5  # penalty if assigned pattern isn't preferred
ADJUNCT_DAY_EXCESS_WEIGHT = 15  # penalty per day beyond adjunct max
SOFT_LOCK_BASE_WEIGHT = 1  # base multiplier for soft lock penalties


class Section(BaseModel):
    id: str
    course_id: str
    section_code: str
    instructor_id: str
    expected_enrollment: int
    enrollment_cap: int
    allowed_meeting_patterns: List[str]
    room_requirements: List[str]
    crosslist_group_id: Optional[str] = None
    tags: List[str]


class InstructorPreferences(BaseModel):
    preferred_days: List[str]
    preferred_patterns: List[str]
    max_teaching_days: Optional[int] = None


class Instructor(BaseModel):
    id: str
    rank_type: str
    unavailable_times: List[str]
    preferences: InstructorPreferences


class Room(BaseModel):
    id: str
    building: str
    capacity: int
    features: List[str]


class Timeslot(BaseModel):
    id: str
    day: str
    start_time: str
    end_time: str


class MeetingPattern(BaseModel):
    id: str
    slots_required: int
    allowed_days: List[str]
    compatible_timeslot_sets: List[List[str]]


class CrossListGroup(BaseModel):
    id: str
    member_section_ids: List[str]
    require_same_room: bool


class NoOverlapGroup(BaseModel):
    id: str
    member_section_ids: List[str]
    reason: str


class BlockedTime(BaseModel):
    scope: str
    timeslot_ids: List[str]
    reason: str


class LockedAssignment(BaseModel):
    section_id: str
    fixed_timeslot_set: Optional[List[str]] = None
    fixed_room: Optional[str] = None


class SoftLock(BaseModel):
    section_id: str
    preferred_timeslot_set: Optional[List[str]] = None
    preferred_room: Optional[str] = None
    weight: float  # Higher = stronger preference (e.g., 1-100)


class SchedulingInput(BaseModel):
    sections: List[Section]
    instructors: List[Instructor]
    rooms: List[Room]
    timeslots: List[Timeslot]
    meeting_patterns: List[MeetingPattern]
    crosslist_groups: List[CrossListGroup]
    no_overlap_groups: List[NoOverlapGroup]
    blocked_times: List[BlockedTime]
    locked_assignments: List[LockedAssignment]
    soft_locks: List[SoftLock] = []


class ValidationError(BaseModel):
    code: str
    message: str


class ScheduleAssignment(BaseModel):
    section_id: str
    meeting_pattern_id: str
    timeslot_ids: List[str]
    room_id: str


class ScheduleSolution(BaseModel):
    assignments: List[ScheduleAssignment]
    total_score: float
    penalty_breakdown: Dict[str, float]
    explanations: List[str]


class ScheduleRequest(BaseModel):
    input: SchedulingInput


def _timeslot_days(timeslots: List[Timeslot]) -> Dict[str, str]:
    """Build a lookup from timeslot ID to day.

    Args:
        timeslots: All timeslot definitions.

    Returns:
        Mapping of timeslot ID to day string.
    """
    return {slot.id: slot.day for slot in timeslots}


def _has_required_features(room: Room, required: List[str]) -> bool:
    """Check if a room satisfies all required features.

    Args:
        room: Room being evaluated.
        required: Required feature names.

    Returns:
        True if all required features are present, else False.
    """
    return all(feature in room.features for feature in required)


def _build_crosslist_totals(sections: List[Section]) -> Dict[str, int]:
    """Compute total expected enrollment per cross-list group.

    Args:
        sections: All section definitions.

    Returns:
        Mapping of cross-list group ID to summed expected enrollment.
    """
    totals: Dict[str, int] = {}
    for section in sections:
        if section.crosslist_group_id:
            totals.setdefault(section.crosslist_group_id, 0)
            totals[section.crosslist_group_id] += section.expected_enrollment
    return totals


def _validate_crosslist_capacity(
    crosslists: List[CrossListGroup],
    sections: List[Section],
    rooms: List[Room],
) -> List[ValidationError]:
    """Validate that each cross-list group can fit in at least one room.

    Args:
        crosslists: Cross-list groups.
        sections: All section definitions.
        rooms: Available rooms.

    Returns:
        List of validation errors (empty if all groups fit).
    """
    errors: List[ValidationError] = []
    max_room_capacity = max((room.capacity for room in rooms), default=0)
    total_by_group = _build_crosslist_totals(sections)
    for group in crosslists:
        total = total_by_group.get(group.id, 0)
        if total > max_room_capacity:
            errors.append(
                ValidationError(
                    code="crosslist_capacity",
                    message=(
                        f"Cross-list group {group.id} requires capacity {total}, "
                        f"but max room is {max_room_capacity}."
                    ),
                )
            )
    return errors


def _build_options(
    input_data: SchedulingInput,
    ignore_blocked_times: bool = False,
    ignore_locks: bool = False,
    ignore_room_capacity: bool = False,
    ignore_room_features: bool = False,
    ignore_crosslist_capacity: bool = False,
) -> Tuple[
    Dict[str, List[Tuple[str, Tuple[str, ...], str, int]]],
    List[ValidationError],
]:
    """Generate feasible assignment options per section.

    Args:
        input_data: Full scheduling input.
        ignore_blocked_times: If True, ignore global blocked times.
        ignore_locks: If True, ignore locked assignments.
        ignore_room_capacity: If True, ignore capacity checks.
        ignore_room_features: If True, ignore feature requirements.
        ignore_crosslist_capacity: If True, ignore cross-list capacity.

    Returns:
        Tuple of (options_by_section, validation_errors).
        options_by_section maps section ID to a list of options:
            (pattern_id, timeslot_set, room_id, room_waste).
    """
    pattern_by_id = {pattern.id: pattern for pattern in input_data.meeting_patterns}
    locked_by_section = (
        {}
        if ignore_locks
        else {lock.section_id: lock for lock in input_data.locked_assignments}
    )
    blocked_times_global = {
        slot
        for blocked in input_data.blocked_times
        if blocked.scope == "global" and not ignore_blocked_times
        for slot in blocked.timeslot_ids
    }

    crosslist_totals = _build_crosslist_totals(input_data.sections)
    options_by_section: Dict[str, List[Tuple[str, Tuple[str, ...], str, int]]] = {}
    errors: List[ValidationError] = []

    for section in input_data.sections:
        lock = locked_by_section.get(section.id)
        available_rooms = []
        for room in input_data.rooms:
            if not ignore_room_capacity and room.capacity < section.expected_enrollment:
                continue
            if not ignore_room_features and not _has_required_features(
                room, section.room_requirements
            ):
                continue
            available_rooms.append(room)
        if section.crosslist_group_id:
            required_capacity = crosslist_totals.get(section.crosslist_group_id, 0)
            if not ignore_crosslist_capacity and not ignore_room_capacity:
                available_rooms = [
                    room
                    for room in available_rooms
                    if room.capacity >= required_capacity
                ]

        section_options: List[Tuple[str, Tuple[str, ...], str, int]] = []
        for pattern_id in section.allowed_meeting_patterns:
            pattern = pattern_by_id.get(pattern_id)
            if not pattern:
                continue
            for timeslot_set in pattern.compatible_timeslot_sets:
                if any(slot in blocked_times_global for slot in timeslot_set):
                    continue
                if lock and lock.fixed_timeslot_set:
                    if set(lock.fixed_timeslot_set) != set(timeslot_set):
                        continue
                for room in available_rooms:
                    if lock and lock.fixed_room and room.id != lock.fixed_room:
                        continue
                    section_options.append(
                        (
                            pattern_id,
                            tuple(timeslot_set),
                            room.id,
                            room.capacity - section.expected_enrollment,
                        )
                    )

        if not section_options:
            errors.append(
                ValidationError(
                    code="no_feasible_options",
                    message=f"Section {section.id} has no feasible assignment options.",
                )
            )
        options_by_section[section.id] = section_options

    return options_by_section, errors


def _strip_section(input_data: SchedulingInput, section_id: str) -> SchedulingInput:
    """Return input data with one section removed and groups adjusted.

    Args:
        input_data: Full scheduling input.
        section_id: Section ID to remove.

    Returns:
        A new SchedulingInput with the section removed and any groups updated.
    """
    remaining_sections = [s for s in input_data.sections if s.id != section_id]
    remaining_crosslists = []
    for group in input_data.crosslist_groups:
        members = [sid for sid in group.member_section_ids if sid != section_id]
        if len(members) >= 2:
            remaining_crosslists.append(
                CrossListGroup(
                    id=group.id,
                    member_section_ids=members,
                    require_same_room=group.require_same_room,
                )
            )
    remaining_no_overlap = []
    for group in input_data.no_overlap_groups:
        members = [sid for sid in group.member_section_ids if sid != section_id]
        if len(members) >= 2:
            remaining_no_overlap.append(
                NoOverlapGroup(
                    id=group.id, member_section_ids=members, reason=group.reason
                )
            )
    remaining_locks = [
        lock for lock in input_data.locked_assignments if lock.section_id != section_id
    ]
    remaining_soft_locks = [
        lock for lock in input_data.soft_locks if lock.section_id != section_id
    ]
    return SchedulingInput(
        sections=remaining_sections,
        instructors=input_data.instructors,
        rooms=input_data.rooms,
        timeslots=input_data.timeslots,
        meeting_patterns=input_data.meeting_patterns,
        crosslist_groups=remaining_crosslists,
        no_overlap_groups=remaining_no_overlap,
        blocked_times=input_data.blocked_times,
        locked_assignments=remaining_locks,
        soft_locks=remaining_soft_locks,
    )


def _check_feasible(
    input_data: SchedulingInput,
    relax: Optional[set] = None,
) -> bool:
    """Check feasibility under optional constraint relaxations.

    Args:
        input_data: Full scheduling input.
        relax: Set of constraint keys to relax (ignore).

    Returns:
        True if a feasible assignment exists, else False.
    """
    relax = relax or set()
    errors: List[ValidationError] = []
    if "crosslist_capacity" not in relax:
        errors.extend(
            _validate_crosslist_capacity(
                input_data.crosslist_groups, input_data.sections, input_data.rooms
            )
        )
    if errors:
        return False

    options_by_section, option_errors = _build_options(
        input_data,
        ignore_blocked_times="blocked_times" in relax,
        ignore_locks="locks" in relax,
        ignore_room_capacity="room_capacity" in relax,
        ignore_room_features="room_features" in relax,
        ignore_crosslist_capacity="crosslist_capacity" in relax,
    )
    if option_errors:
        return False

    model = cp_model.CpModel()
    sections_by_id = {section.id: section for section in input_data.sections}

    option_vars: Dict[Tuple[str, int], cp_model.IntVar] = {}
    option_data: Dict[Tuple[str, int], Tuple[str, Tuple[str, ...], str, int]] = {}

    for section_id, options in options_by_section.items():
        section_vars = []
        for idx, option in enumerate(options):
            var = model.NewBoolVar(f"opt_{section_id}_{idx}")
            option_vars[(section_id, idx)] = var
            option_data[(section_id, idx)] = option
            section_vars.append(var)
        model.Add(sum(section_vars) == 1)

    if "room_conflicts" not in relax:
        for room in input_data.rooms:
            for timeslot in input_data.timeslots:
                vars_for_slot = []
                for (section_id, idx), var in option_vars.items():
                    _, timeslot_set, room_id, _ = option_data[(section_id, idx)]
                    if room_id == room.id and timeslot.id in timeslot_set:
                        vars_for_slot.append(var)
                if vars_for_slot:
                    model.Add(sum(vars_for_slot) <= 1)

    if "instructor_conflicts" not in relax:
        for instructor in input_data.instructors:
            for timeslot in input_data.timeslots:
                vars_for_slot = []
                for (section_id, idx), var in option_vars.items():
                    section = sections_by_id[section_id]
                    if section.instructor_id != instructor.id:
                        continue
                    _, timeslot_set, _, _ = option_data[(section_id, idx)]
                    if timeslot.id in timeslot_set:
                        vars_for_slot.append(var)
                if vars_for_slot:
                    model.Add(sum(vars_for_slot) <= 1)

    if "no_overlap_groups" not in relax:
        for group in input_data.no_overlap_groups:
            for timeslot in input_data.timeslots:
                vars_for_slot = []
                for section_id in group.member_section_ids:
                    for idx, _ in enumerate(options_by_section.get(section_id, [])):
                        var = option_vars[(section_id, idx)]
                        _, timeslot_set, _, _ = option_data[(section_id, idx)]
                        if timeslot.id in timeslot_set:
                            vars_for_slot.append(var)
                if vars_for_slot:
                    model.Add(sum(vars_for_slot) <= 1)

    if "crosslist_time_room" not in relax:
        for group in input_data.crosslist_groups:
            members = group.member_section_ids
            for i, section_a in enumerate(members):
                for section_b in members[i + 1 :]:
                    options_a = options_by_section.get(section_a, [])
                    options_b = options_by_section.get(section_b, [])
                    for idx_a, option_a in enumerate(options_a):
                        _, timeslot_a, room_a, _ = option_a
                        for idx_b, option_b in enumerate(options_b):
                            _, timeslot_b, room_b, _ = option_b
                            if timeslot_a != timeslot_b:
                                model.Add(
                                    option_vars[(section_a, idx_a)]
                                    + option_vars[(section_b, idx_b)]
                                    <= 1
                                )
                            elif group.require_same_room and room_a != room_b:
                                model.Add(
                                    option_vars[(section_a, idx_a)]
                                    + option_vars[(section_b, idx_b)]
                                    <= 1
                                )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 2.0
    status = solver.Solve(model)
    return status in (cp_model.OPTIMAL, cp_model.FEASIBLE)


def _diagnose_infeasibility(input_data: SchedulingInput) -> Dict[str, List[str]]:
    """Suggest single-step relaxations/removals that restore feasibility.

    Args:
        input_data: Full scheduling input.

    Returns:
        Diagnostics with two lists:
            - feasible_if_relax: constraint families to relax.
            - feasible_if_remove_section: section IDs to remove.
    """
    relax_candidates = [
        ("blocked_times", "Blocked time constraints"),
        ("locks", "Locked assignments"),
        ("room_capacity", "Room capacity"),
        ("room_features", "Room feature requirements"),
        ("crosslist_capacity", "Cross-list capacity"),
        ("room_conflicts", "Room overlap constraints"),
        ("instructor_conflicts", "Instructor overlap constraints"),
        ("no_overlap_groups", "No-overlap groups"),
        ("crosslist_time_room", "Cross-list time/room equality"),
    ]
    feasible_if_relax: List[str] = []
    for relax_key, label in relax_candidates:
        if _check_feasible(input_data, {relax_key}):
            feasible_if_relax.append(label)

    feasible_if_remove_section: List[str] = []
    for section in input_data.sections:
        stripped = _strip_section(input_data, section.id)
        if _check_feasible(stripped):
            feasible_if_remove_section.append(section.id)

    return {
        "feasible_if_relax": feasible_if_relax,
        "feasible_if_remove_section": feasible_if_remove_section,
    }


def _solve_schedule(input_data: SchedulingInput):
    """Solve the schedule using CP-SAT.

    Args:
        input_data: Full scheduling input.

    Returns:
        Dict payload with status, solution or errors/diagnostics.
    """
    errors: List[ValidationError] = []
    errors.extend(
        _validate_crosslist_capacity(
            input_data.crosslist_groups, input_data.sections, input_data.rooms
        )
    )
    options_by_section, option_errors = _build_options(input_data)
    errors.extend(option_errors)
    if errors:
        return {"status": "error", "errors": [err.model_dump() for err in errors]}

    # Build optimization model
    model = cp_model.CpModel()
    timeslot_day = _timeslot_days(input_data.timeslots)
    instructors_by_id = {inst.id: inst for inst in input_data.instructors}
    sections_by_id = {section.id: section for section in input_data.sections}
    crosslist_roomshare = {
        group.id
        for group in input_data.crosslist_groups
        if group.require_same_room
    }
    section_to_roomshare_group: Dict[str, str] = {}
    for section in input_data.sections:
        if section.crosslist_group_id in crosslist_roomshare:
            section_to_roomshare_group[section.id] = section.crosslist_group_id  # type: ignore[arg-type]
        else:
            section_to_roomshare_group[section.id] = f"sec:{section.id}"

    option_vars: Dict[Tuple[str, int], cp_model.IntVar] = {}
    option_data: Dict[Tuple[str, int], Tuple[str, Tuple[str, ...], str, int]] = {}

    # One option must be selected per section.
    for section_id, options in options_by_section.items():
        section_vars = []
        for idx, option in enumerate(options):
            var = model.NewBoolVar(f"opt_{section_id}_{idx}")
            option_vars[(section_id, idx)] = var
            option_data[(section_id, idx)] = option
            section_vars.append(var)
        model.Add(sum(section_vars) == 1)

    # Room usage: prevent overlaps across different roomshare groups.
    for room in input_data.rooms:
        for timeslot in input_data.timeslots:
            vars_by_group: Dict[str, List[cp_model.IntVar]] = {}
            for (section_id, idx), var in option_vars.items():
                _, timeslot_set, room_id, _ = option_data[(section_id, idx)]
                if room_id == room.id and timeslot.id in timeslot_set:
                    group_key = section_to_roomshare_group[section_id]
                    vars_by_group.setdefault(group_key, []).append(var)
            if vars_by_group:
                group_used_vars = []
                for group_key, vars_for_group in vars_by_group.items():
                    group_used = model.NewBoolVar(f"room_use_{room.id}_{timeslot.id}_{group_key}")
                    for var in vars_for_group:
                        model.Add(group_used >= var)
                    group_used_vars.append(group_used)
                model.Add(sum(group_used_vars) <= 1)

    # Instructor cannot teach overlapping times.
    for instructor in input_data.instructors:
        for timeslot in input_data.timeslots:
            vars_for_slot = []
            for (section_id, idx), var in option_vars.items():
                section = sections_by_id[section_id]
                if section.instructor_id != instructor.id:
                    continue
                _, timeslot_set, _, _ = option_data[(section_id, idx)]
                if timeslot.id in timeslot_set:
                    vars_for_slot.append(var)
            if vars_for_slot:
                model.Add(sum(vars_for_slot) <= 1)

    # No-overlap groups cannot overlap in time.
    for group in input_data.no_overlap_groups:
        for timeslot in input_data.timeslots:
            vars_for_slot = []
            for section_id in group.member_section_ids:
                for idx, _ in enumerate(options_by_section.get(section_id, [])):
                    var = option_vars[(section_id, idx)]
                    _, timeslot_set, _, _ = option_data[(section_id, idx)]
                    if timeslot.id in timeslot_set:
                        vars_for_slot.append(var)
            if vars_for_slot:
                model.Add(sum(vars_for_slot) <= 1)

    # Cross-listed sections share times and (optionally) room.
    for group in input_data.crosslist_groups:
        members = group.member_section_ids
        for i, section_a in enumerate(members):
            for section_b in members[i + 1 :]:
                options_a = options_by_section.get(section_a, [])
                options_b = options_by_section.get(section_b, [])
                for idx_a, option_a in enumerate(options_a):
                    _, timeslot_a, room_a, _ = option_a
                    for idx_b, option_b in enumerate(options_b):
                        _, timeslot_b, room_b, _ = option_b
                        if timeslot_a != timeslot_b:
                            model.Add(
                                option_vars[(section_a, idx_a)]
                                + option_vars[(section_b, idx_b)]
                                <= 1
                            )
                        elif group.require_same_room and room_a != room_b:
                            model.Add(
                                option_vars[(section_a, idx_a)]
                                + option_vars[(section_b, idx_b)]
                                <= 1
                            )

    # Soft constraint terms for the objective.
    penalty_terms = []
    unique_days = sorted({slot.day for slot in input_data.timeslots})

    instructor_day_vars: Dict[Tuple[str, str], cp_model.IntVar] = {}
    adjunct_day_excess_vars: Dict[str, cp_model.IntVar] = {}
    # Track adjunct teaching days for max-teaching-days penalty.
    for instructor in input_data.instructors:
        if instructor.rank_type != "Adjunct" or not instructor.preferences.max_teaching_days:
            continue
        day_vars = []
        for day in unique_days:
            day_var = model.NewBoolVar(f"day_{instructor.id}_{day}")
            instructor_day_vars[(instructor.id, day)] = day_var
            day_vars.append(day_var)
        max_days = instructor.preferences.max_teaching_days
        excess = model.NewIntVar(0, len(unique_days), f"excess_{instructor.id}")
        model.Add(excess >= sum(day_vars) - max_days)
        model.Add(excess >= 0)
        adjunct_day_excess_vars[instructor.id] = excess
        penalty_terms.append(excess * ADJUNCT_DAY_EXCESS_WEIGHT)

    # Penalties per assignment: room waste, day preference, pattern preference.
    for (section_id, idx), var in option_vars.items():
        pattern_id, timeslot_set, room_id, room_waste = option_data[
            (section_id, idx)
        ]
        section = sections_by_id[section_id]
        instructor = instructors_by_id.get(section.instructor_id)
        preferred_days = instructor.preferences.preferred_days if instructor else []
        preferred_patterns = (
            instructor.preferences.preferred_patterns if instructor else []
        )
        days = {timeslot_day[slot_id] for slot_id in timeslot_set}
        pref_day_penalty = 0 if days & set(preferred_days) else PREF_DAY_WEIGHT
        pref_pattern_penalty = (
            0 if pattern_id in preferred_patterns else PREF_PATTERN_WEIGHT
        )
        total_penalty = (
            room_waste * ROOM_WASTE_WEIGHT + pref_day_penalty + pref_pattern_penalty
        )
        penalty_terms.append(var * total_penalty)

        # Link chosen option to adjunct day usage.
        if instructor and instructor.rank_type == "Adjunct":
            for day in days:
                day_var = instructor_day_vars.get((instructor.id, day))
                if day_var is not None:
                    model.Add(day_var >= var)

    # Soft lock penalties: penalize options that don't match preferred time/room.
    soft_lock_by_section = {lock.section_id: lock for lock in input_data.soft_locks}
    for (section_id, idx), var in option_vars.items():
        soft_lock = soft_lock_by_section.get(section_id)
        if not soft_lock:
            continue
        pattern_id, timeslot_set, room_id, _ = option_data[(section_id, idx)]
        soft_penalty = 0
        # Penalize if timeslot doesn't match preference
        if soft_lock.preferred_timeslot_set:
            if set(timeslot_set) != set(soft_lock.preferred_timeslot_set):
                soft_penalty += soft_lock.weight * SOFT_LOCK_BASE_WEIGHT
        # Penalize if room doesn't match preference
        if soft_lock.preferred_room:
            if room_id != soft_lock.preferred_room:
                soft_penalty += soft_lock.weight * SOFT_LOCK_BASE_WEIGHT
        if soft_penalty > 0:
            penalty_terms.append(var * int(soft_penalty))

    # Minimize total penalty.
    model.Minimize(sum(penalty_terms))

    # Solve model.
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        diagnostics = _diagnose_infeasibility(input_data)
        print(diagnostics)
        return {
            "status": "error",
            "errors": [
                ValidationError(
                    code="infeasible", message="No feasible schedule found."
                ).model_dump()
            ],
            "diagnostics": diagnostics,
        }

    assignments: List[ScheduleAssignment] = []
    explanations: List[str] = []
    penalty_breakdown = {
        "room_waste": 0.0,
        "instructor_day_preference": 0.0,
        "instructor_pattern_preference": 0.0,
        "adjunct_day_excess": 0.0,
        "soft_lock_time": 0.0,
        "soft_lock_room": 0.0,
    }

    for section_id, options in options_by_section.items():
        chosen_idx = None
        for idx in range(len(options)):
            if solver.Value(option_vars[(section_id, idx)]) == 1:
                chosen_idx = idx
                break
        if chosen_idx is None:
            continue
        pattern_id, timeslot_set, room_id, room_waste = option_data[
            (section_id, chosen_idx)
        ]
        section = sections_by_id[section_id]
        instructor = instructors_by_id.get(section.instructor_id)
        preferred_days = instructor.preferences.preferred_days if instructor else []
        preferred_patterns = (
            instructor.preferences.preferred_patterns if instructor else []
        )
        days = {timeslot_day[slot_id] for slot_id in timeslot_set}
        pref_day_penalty = 0 if days & set(preferred_days) else PREF_DAY_WEIGHT
        pref_pattern_penalty = (
            0 if pattern_id in preferred_patterns else PREF_PATTERN_WEIGHT
        )
        penalty_breakdown["room_waste"] += float(room_waste * ROOM_WASTE_WEIGHT)
        penalty_breakdown["instructor_day_preference"] += float(pref_day_penalty)
        penalty_breakdown["instructor_pattern_preference"] += float(
            pref_pattern_penalty
        )

        # Calculate soft lock penalties for this assignment
        soft_lock = soft_lock_by_section.get(section_id)
        if soft_lock:
            if soft_lock.preferred_timeslot_set:
                if set(timeslot_set) != set(soft_lock.preferred_timeslot_set):
                    penalty_breakdown["soft_lock_time"] += float(
                        soft_lock.weight * SOFT_LOCK_BASE_WEIGHT
                    )
            if soft_lock.preferred_room:
                if room_id != soft_lock.preferred_room:
                    penalty_breakdown["soft_lock_room"] += float(
                        soft_lock.weight * SOFT_LOCK_BASE_WEIGHT
                    )

        assignments.append(
            ScheduleAssignment(
                section_id=section_id,
                meeting_pattern_id=pattern_id,
                timeslot_ids=list(timeslot_set),
                room_id=room_id,
            )
        )
        explanations.append(
            f"Section {section_id} assigned to {room_id} at {', '.join(timeslot_set)}."
        )

    for instructor_id, excess_var in adjunct_day_excess_vars.items():
        excess_days = solver.Value(excess_var)
        if excess_days:
            penalty_breakdown["adjunct_day_excess"] += float(
                excess_days * ADJUNCT_DAY_EXCESS_WEIGHT
            )

    total_score = sum(penalty_breakdown.values())
    solution = ScheduleSolution(
        assignments=assignments,
        total_score=total_score,
        penalty_breakdown=penalty_breakdown,
        explanations=explanations,
    )
    return {"status": "ok", **solution.model_dump()}


@app.get("/")
async def read_root():
    return {"service": "weatherhead-solver", "status": "ok"}


@app.post("/solve")
async def solve(request: ScheduleRequest):
    return _solve_schedule(request.input)
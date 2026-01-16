from typing import Dict, List, Optional, Tuple

from fastapi import FastAPI
from ortools.sat.python import cp_model
from pydantic import BaseModel

app = FastAPI()


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
    return {slot.id: slot.day for slot in timeslots}


def _has_required_features(room: Room, required: List[str]) -> bool:
    return all(feature in room.features for feature in required)


def _build_crosslist_totals(sections: List[Section]) -> Dict[str, int]:
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
) -> Tuple[
    Dict[str, List[Tuple[str, Tuple[str, ...], str, int]]],
    List[ValidationError],
]:
    pattern_by_id = {pattern.id: pattern for pattern in input_data.meeting_patterns}
    locked_by_section = {
        lock.section_id: lock for lock in input_data.locked_assignments
    }
    blocked_times_global = {
        slot
        for blocked in input_data.blocked_times
        if blocked.scope == "global"
        for slot in blocked.timeslot_ids
    }

    crosslist_totals = _build_crosslist_totals(input_data.sections)
    options_by_section: Dict[str, List[Tuple[str, Tuple[str, ...], str, int]]] = {}
    errors: List[ValidationError] = []

    for section in input_data.sections:
        lock = locked_by_section.get(section.id)
        available_rooms = [
            room
            for room in input_data.rooms
            if room.capacity >= section.expected_enrollment
            and _has_required_features(room, section.room_requirements)
        ]
        if section.crosslist_group_id:
            required_capacity = crosslist_totals.get(section.crosslist_group_id, 0)
            available_rooms = [
                room for room in available_rooms if room.capacity >= required_capacity
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


def _solve_schedule(input_data: SchedulingInput):
    errors: List[ValidationError] = []
    errors.extend(
        _validate_crosslist_capacity(
            input_data.crosslist_groups, input_data.sections, input_data.rooms
        )
    )
    options_by_section, option_errors = _build_options(input_data)
    errors.extend(option_errors)
    if errors:
        return {"status": "error", "errors": [err.dict() for err in errors]}

    model = cp_model.CpModel()
    timeslot_day = _timeslot_days(input_data.timeslots)
    instructors_by_id = {inst.id: inst for inst in input_data.instructors}
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

    for room in input_data.rooms:
        for timeslot in input_data.timeslots:
            vars_for_slot = []
            for (section_id, idx), var in option_vars.items():
                _, timeslot_set, room_id, _ = option_data[(section_id, idx)]
                if room_id == room.id and timeslot.id in timeslot_set:
                    vars_for_slot.append(var)
            if vars_for_slot:
                model.Add(sum(vars_for_slot) <= 1)

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

    penalty_terms = []
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
        pref_day_penalty = 0 if days & set(preferred_days) else 10
        pref_pattern_penalty = 0 if pattern_id in preferred_patterns else 5
        total_penalty = room_waste + pref_day_penalty + pref_pattern_penalty
        penalty_terms.append(var * total_penalty)

    model.Minimize(sum(penalty_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "status": "error",
            "errors": [
                ValidationError(
                    code="infeasible", message="No feasible schedule found."
                ).dict()
            ],
        }

    assignments: List[ScheduleAssignment] = []
    explanations: List[str] = []
    penalty_breakdown = {
        "room_waste": 0.0,
        "instructor_day_preference": 0.0,
        "instructor_pattern_preference": 0.0,
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
        pref_day_penalty = 0 if days & set(preferred_days) else 10
        pref_pattern_penalty = 0 if pattern_id in preferred_patterns else 5
        penalty_breakdown["room_waste"] += float(room_waste)
        penalty_breakdown["instructor_day_preference"] += float(pref_day_penalty)
        penalty_breakdown["instructor_pattern_preference"] += float(
            pref_pattern_penalty
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

    total_score = sum(penalty_breakdown.values())
    solution = ScheduleSolution(
        assignments=assignments,
        total_score=total_score,
        penalty_breakdown=penalty_breakdown,
        explanations=explanations,
    )
    return {"status": "ok", **solution.dict()}


@app.get("/")
async def read_root():
    return {"service": "weatherhead-solver", "status": "ok"}


@app.post("/solve")
async def solve(request: ScheduleRequest):
    return _solve_schedule(request.input)
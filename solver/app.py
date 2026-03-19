from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime

from flask import Flask, jsonify, request, make_response
from flask_cors import CORS
from ortools.sat.python import cp_model
from werkzeug.utils import secure_filename

from excel_importer import ParsedData, persist_parsed_data
from unified_importer import build_parsed_data_from_excel, build_scheduling_input_from_parsed
from persistence import replace_scheduling_data
from spreadsheet_io.export_to_spreadsheet import scheduling_input_to_excel_bytes
from spreadsheet_io.import_from_spreadsheet import parse_scheduling_input_from_excel_bytes
from spreadsheet_io.spreadsheet_utils import build_template_bytes
from model import (
    Section,
    Timeslot,
    db,
)

app = Flask(__name__)
DB_PATH = (Path(__file__).resolve().parent.parent / "instance" / "course_scheduler.db").as_posix()
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DB_PATH}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Enable CORS for all routes
CORS(app, origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5001"])

db.init_app(app)

ROOM_WASTE_WEIGHT = 1  # penalty per empty seat in assigned room
PREF_DAY_WEIGHT = 10  # penalty if assigned days don't match instructor preferences
PREF_PATTERN_WEIGHT = 5  # penalty if assigned pattern isn't preferred
ADJUNCT_DAY_EXCESS_WEIGHT = 15  # penalty per day beyond adjunct max
SOFT_LOCK_BASE_WEIGHT = 1  # base multiplier for soft lock penalties


# Helper class to represent scheduling input (not a database model)
# This works with dictionaries from JSON requests
class SchedulingInput:
    def __init__(self, data: dict):
        # Store as dictionaries - the helper functions handle conversion
        self.sections = data.get("sections", [])
        self.instructors = data.get("instructors", [])
        self.rooms = data.get("rooms", [])
        self.timeslots = data.get("timeslots", [])
        self.meeting_patterns = data.get("meeting_patterns", [])
        self.crosslist_groups = data.get("crosslist_groups", [])
        self.no_overlap_groups = data.get("no_overlap_groups", [])
        self.blocked_times = data.get("blocked_times", [])
        self.locked_assignments = data.get("locked_assignments", [])
        self.soft_locks = data.get("soft_locks", [])


def _timeslot_days(timeslots: List[Timeslot | dict]) -> Dict[str, str]:
    """Build a lookup from timeslot ID to day.

    Args:
        timeslots: All timeslot definitions.

    Returns:
        Mapping of timeslot ID to day string.
    """
    # `SchedulingInput` stores JSON payloads as plain dicts, not ORM objects.
    # Support both dict-shaped timeslots and ORM-shaped timeslots.
    out: Dict[str, str] = {}
    for slot in timeslots:
        if isinstance(slot, dict):
            slot_id = slot.get("id")
            slot_day = slot.get("day")
        else:
            slot_id = slot.id
            slot_day = slot.day

        # Defensive: fail loudly if the payload is malformed.
        if slot_id is None or slot_day is None:
            raise ValueError(f"Invalid timeslot payload: {slot!r}")

        out[str(slot_id)] = str(slot_day)
    return out


def _section_to_dict(section) -> dict:
    """Convert section (dict or model) to dict."""
    if isinstance(section, dict):
        return section
    return section.to_dict() if hasattr(section, "to_dict") else {
        "id": section.id,
        "course_id": section.course_id,
        "section_code": section.section_code,
        "instructor_id": section.instructor_id,
        "expected_enrollment": section.expected_enrollment,
        "enrollment_cap": section.enrollment_cap,
        "allowed_meeting_patterns": getattr(section, "allowed_meeting_patterns", []),
        "room_requirements": getattr(section, "room_requirements", []),
        "crosslist_group_id": getattr(section, "crosslist_group_id", None),
        "tags": getattr(section, "tags", []),
    }


def _room_to_dict(room) -> dict:
    """Convert room (dict or model) to dict."""
    if isinstance(room, dict):
        return room
    return room.to_dict() if hasattr(room, "to_dict") else {
        "id": room.id,
        "building": room.building,
        "capacity": room.capacity,
        "features": getattr(room, "features", []),
    }


def _instructor_to_dict(instructor) -> dict:
    """Convert instructor (dict or model) to dict."""
    if isinstance(instructor, dict):
        return instructor
    return instructor.to_dict() if hasattr(instructor, "to_dict") else {
        "id": instructor.id,
        "rank_type": instructor.rank_type,
        "unavailable_times": getattr(instructor, "unavailable_times", []),
        "preferences": getattr(instructor, "preferences", {}),
    }


def _has_required_features(room, required: List[str]) -> bool:
    """Check if a room satisfies all required features.

    Args:
        room: Room being evaluated (dict or model).
        required: Required feature names.

    Returns:
        True if all required features are present, else False.
    """
    room_dict = _room_to_dict(room)
    room_features = room_dict.get("features", [])
    return all(feature in room_features for feature in required)


def _build_crosslist_totals(sections: List) -> Dict[str, int]:
    """Compute total expected enrollment per cross-list group.

    Args:
        sections: All section definitions.

    Returns:
        Mapping of cross-list group ID to summed expected enrollment.
    """
    totals: Dict[str, int] = {}
    for section in sections:
        section_dict = _section_to_dict(section)
        crosslist_id = section_dict.get("crosslist_group_id")
        if crosslist_id:
            totals.setdefault(crosslist_id, 0)
            totals[crosslist_id] += section_dict.get("expected_enrollment", 0)
    return totals


def _validate_crosslist_capacity(
    crosslists: List,
    sections: List,
    rooms: List,
) -> List[dict]:
    """Validate that each cross-list group can fit in at least one room.

    Args:
        crosslists: Cross-list groups.
        sections: All section definitions.
        rooms: Available rooms.

    Returns:
        List of validation error dicts (empty if all groups fit).
    """
    errors: List[dict] = []
    max_room_capacity = max((_room_to_dict(room).get("capacity", 0) for room in rooms), default=0)
    total_by_group = _build_crosslist_totals(sections)
    for group in crosslists:
        group_dict = group.to_dict() if hasattr(group, "to_dict") else group
        group_id = group_dict.get("id") if isinstance(group_dict, dict) else group.id
        total = total_by_group.get(group_id, 0)
        if total > max_room_capacity:
            errors.append({
                "code": "crosslist_capacity",
                "message": (
                    f"Cross-list group {group_id} requires capacity {total}, "
                    f"but max room is {max_room_capacity}."
                ),
            })
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
    List[dict],
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
    pattern_by_id = {}
    for pattern in input_data.meeting_patterns:
        pattern_dict = pattern.to_dict() if hasattr(pattern, "to_dict") else pattern
        pattern_id = pattern_dict.get("id") if isinstance(pattern_dict, dict) else pattern.id
        pattern_by_id[pattern_id] = pattern_dict if isinstance(pattern_dict, dict) else pattern

    locked_by_section = {}
    if not ignore_locks:
        for lock in input_data.locked_assignments:
            lock_dict = lock.to_dict() if hasattr(lock, "to_dict") else lock
            section_id = lock_dict.get("section_id") if isinstance(lock_dict, dict) else lock.section_id
            locked_by_section[section_id] = lock_dict if isinstance(lock_dict, dict) else lock

    blocked_times_global = set()
    if not ignore_blocked_times:
        for blocked in input_data.blocked_times:
            blocked_dict = blocked.to_dict() if hasattr(blocked, "to_dict") else blocked
            scope = blocked_dict.get("scope") if isinstance(blocked_dict, dict) else blocked.scope
            if scope == "global":
                timeslot_ids = blocked_dict.get("timeslot_ids", []) if isinstance(blocked_dict, dict) else blocked.timeslot_ids
                blocked_times_global.update(timeslot_ids)

    crosslist_totals = _build_crosslist_totals(input_data.sections)
    options_by_section: Dict[str, List[Tuple[str, Tuple[str, ...], str, int]]] = {}
    errors: List[dict] = []

    for section in input_data.sections:
        section_dict = _section_to_dict(section)
        section_id = section_dict["id"]
        lock = locked_by_section.get(section_id)
        available_rooms = []
        for room in input_data.rooms:
            room_dict = _room_to_dict(room)
            if not ignore_room_capacity and room_dict["capacity"] < section_dict["expected_enrollment"]:
                continue
            if not ignore_room_features and not _has_required_features(
                room_dict, section_dict.get("room_requirements", [])
            ):
                continue
            available_rooms.append(room_dict)
        crosslist_id = section_dict.get("crosslist_group_id")
        if crosslist_id:
            required_capacity = crosslist_totals.get(crosslist_id, 0)
            if not ignore_crosslist_capacity and not ignore_room_capacity:
                available_rooms = [
                    room
                    for room in available_rooms
                    if room["capacity"] >= required_capacity
                ]

        section_options: List[Tuple[str, Tuple[str, ...], str, int]] = []
        for pattern_id in section_dict.get("allowed_meeting_patterns", []):
            pattern = pattern_by_id.get(pattern_id)
            if not pattern:
                continue
            pattern_dict = pattern if isinstance(pattern, dict) else (pattern.to_dict() if hasattr(pattern, "to_dict") else pattern)
            compatible_sets = pattern_dict.get("compatible_timeslot_sets", [])
            for timeslot_set in compatible_sets:
                if any(slot in blocked_times_global for slot in timeslot_set):
                    continue
                if lock:
                    fixed_timeslot_set = lock.get("fixed_timeslot_set") if isinstance(lock, dict) else getattr(lock, "fixed_timeslot_set", None)
                    if fixed_timeslot_set and set(fixed_timeslot_set) != set(timeslot_set):
                        continue
                for room in available_rooms:
                    if lock:
                        fixed_room = lock.get("fixed_room") if isinstance(lock, dict) else getattr(lock, "fixed_room", None)
                        if fixed_room and room["id"] != fixed_room:
                            continue
                    section_options.append(
                        (
                            pattern_id,
                            tuple(timeslot_set),
                            room["id"],
                            room["capacity"] - section_dict["expected_enrollment"],
                        )
                    )

        if not section_options:
            errors.append({
                "code": "no_feasible_options",
                "message": f"Section {section_id} has no feasible assignment options.",
            })
        options_by_section[section_id] = section_options

    return options_by_section, errors


def _strip_section(input_data: SchedulingInput, section_id: str) -> SchedulingInput:
    """Return input data with one section removed and groups adjusted.

    Args:
        input_data: Full scheduling input.
        section_id: Section ID to remove.

    Returns:
        A new SchedulingInput with the section removed and any groups updated.
    """
    remaining_sections = [s for s in input_data.sections if _section_to_dict(s)["id"] != section_id]
    remaining_crosslists = []
    for group in input_data.crosslist_groups:
        group_dict = group.to_dict() if hasattr(group, "to_dict") else group
        members = [sid for sid in group_dict.get("member_section_ids", []) if sid != section_id]
        if len(members) >= 2:
            remaining_crosslists.append({
                "id": group_dict.get("id") if isinstance(group_dict, dict) else group.id,
                "member_section_ids": members,
                "require_same_room": group_dict.get("require_same_room") if isinstance(group_dict, dict) else group.require_same_room,
            })
    remaining_no_overlap = []
    for group in input_data.no_overlap_groups:
        group_dict = group.to_dict() if hasattr(group, "to_dict") else group
        members = [sid for sid in group_dict.get("member_section_ids", []) if sid != section_id]
        if len(members) >= 2:
            remaining_no_overlap.append({
                "id": group_dict.get("id") if isinstance(group_dict, dict) else group.id,
                "member_section_ids": members,
                "reason": group_dict.get("reason") if isinstance(group_dict, dict) else group.reason,
            })
    remaining_locks = []
    for lock in input_data.locked_assignments:
        lock_dict = lock.to_dict() if hasattr(lock, "to_dict") else lock
        if lock_dict.get("section_id") != section_id:
            remaining_locks.append(lock)
    remaining_soft_locks = []
    for lock in input_data.soft_locks:
        lock_dict = lock.to_dict() if hasattr(lock, "to_dict") else lock
        if lock_dict.get("section_id") != section_id:
            remaining_soft_locks.append(lock)
    
    return SchedulingInput({
        "sections": remaining_sections,
        "instructors": input_data.instructors,
        "rooms": input_data.rooms,
        "timeslots": input_data.timeslots,
        "meeting_patterns": input_data.meeting_patterns,
        "crosslist_groups": remaining_crosslists,
        "no_overlap_groups": remaining_no_overlap,
        "blocked_times": input_data.blocked_times,
        "locked_assignments": remaining_locks,
        "soft_locks": remaining_soft_locks,
    })


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
    errors: List[dict] = []
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
    sections_by_id = {_section_to_dict(s)["id"]: s for s in input_data.sections}

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
            instructor_dict = _instructor_to_dict(instructor)
            instructor_id = instructor_dict["id"]
            for timeslot in input_data.timeslots:
                timeslot_dict = timeslot.to_dict() if hasattr(timeslot, "to_dict") else timeslot
                timeslot_id = timeslot_dict.get("id") if isinstance(timeslot_dict, dict) else timeslot.id
                vars_for_slot = []
                for (section_id, idx), var in option_vars.items():
                    section = sections_by_id[section_id]
                    section_dict = _section_to_dict(section)
                    if section_dict["instructor_id"] != instructor_id:
                        continue
                    _, timeslot_set, _, _ = option_data[(section_id, idx)]
                    if timeslot_id in timeslot_set:
                        vars_for_slot.append(var)
                if vars_for_slot:
                    model.Add(sum(vars_for_slot) <= 1)

    if "no_overlap_groups" not in relax:
        for group in input_data.no_overlap_groups:
            group_dict = group.to_dict() if hasattr(group, "to_dict") else group
            member_ids = group_dict.get("member_section_ids", []) if isinstance(group_dict, dict) else group.member_section_ids
            for timeslot in input_data.timeslots:
                timeslot_dict = timeslot.to_dict() if hasattr(timeslot, "to_dict") else timeslot
                timeslot_id = timeslot_dict.get("id") if isinstance(timeslot_dict, dict) else timeslot.id
                vars_for_slot = []
                for section_id in member_ids:
                    for idx, _ in enumerate(options_by_section.get(section_id, [])):
                        var = option_vars[(section_id, idx)]
                        _, timeslot_set, _, _ = option_data[(section_id, idx)]
                        if timeslot_id in timeslot_set:
                            vars_for_slot.append(var)
                if vars_for_slot:
                    model.Add(sum(vars_for_slot) <= 1)

    if "crosslist_time_room" not in relax:
        for group in input_data.crosslist_groups:
            group_dict = group.to_dict() if hasattr(group, "to_dict") else group
            members = group_dict.get("member_section_ids", []) if isinstance(group_dict, dict) else group.member_section_ids
            require_same_room = group_dict.get("require_same_room", False) if isinstance(group_dict, dict) else group.require_same_room
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
                            elif require_same_room and room_a != room_b:
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
        section_dict = _section_to_dict(section)
        section_id = section_dict["id"]
        stripped = _strip_section(input_data, section_id)
        if _check_feasible(stripped):
            feasible_if_remove_section.append(section_id)

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
    errors: List[dict] = []
    errors.extend(
        _validate_crosslist_capacity(
            input_data.crosslist_groups, input_data.sections, input_data.rooms
        )
    )
    options_by_section, option_errors = _build_options(input_data)
    errors.extend(option_errors)
    if errors:
        return {"status": "error", "errors": errors}

    # Build optimization model
    model = cp_model.CpModel()
    timeslot_day = _timeslot_days(input_data.timeslots)
    instructors_by_id = {_instructor_to_dict(inst)["id"]: inst for inst in input_data.instructors}
    sections_by_id = {_section_to_dict(s)["id"]: s for s in input_data.sections}
    crosslist_roomshare = set()
    for group in input_data.crosslist_groups:
        group_dict = group.to_dict() if hasattr(group, "to_dict") else group
        group_id = group_dict.get("id") if isinstance(group_dict, dict) else group.id
        require_same_room = group_dict.get("require_same_room", False) if isinstance(group_dict, dict) else group.require_same_room
        if require_same_room:
            crosslist_roomshare.add(group_id)
    section_to_roomshare_group: Dict[str, str] = {}
    for section in input_data.sections:
        section_dict = _section_to_dict(section)
        section_id = section_dict["id"]
        crosslist_id = section_dict.get("crosslist_group_id")
        if crosslist_id in crosslist_roomshare:
            section_to_roomshare_group[section_id] = crosslist_id
        else:
            section_to_roomshare_group[section_id] = f"sec:{section_id}"

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
        room_dict = _room_to_dict(room)
        room_id = room_dict["id"]
        for timeslot in input_data.timeslots:
            timeslot_dict = timeslot.to_dict() if hasattr(timeslot, "to_dict") else timeslot
            timeslot_id = timeslot_dict.get("id") if isinstance(timeslot_dict, dict) else timeslot.id
            vars_by_group: Dict[str, List[cp_model.IntVar]] = {}
            for (section_id, idx), var in option_vars.items():
                _, timeslot_set, opt_room_id, _ = option_data[(section_id, idx)]
                if opt_room_id == room_id and timeslot_id in timeslot_set:
                    group_key = section_to_roomshare_group[section_id]
                    vars_by_group.setdefault(group_key, []).append(var)
            if vars_by_group:
                group_used_vars = []
                for group_key, vars_for_group in vars_by_group.items():
                    group_used = model.NewBoolVar(f"room_use_{room_id}_{timeslot_id}_{group_key}")
                    for var in vars_for_group:
                        model.Add(group_used >= var)
                    group_used_vars.append(group_used)
                model.Add(sum(group_used_vars) <= 1)

    # Instructor cannot teach overlapping times.
    for instructor in input_data.instructors:
        instructor_dict = _instructor_to_dict(instructor)
        instructor_id = instructor_dict["id"]
        for timeslot in input_data.timeslots:
            timeslot_dict = timeslot.to_dict() if hasattr(timeslot, "to_dict") else timeslot
            timeslot_id = timeslot_dict.get("id") if isinstance(timeslot_dict, dict) else timeslot.id
            vars_for_slot = []
            for (section_id, idx), var in option_vars.items():
                section = sections_by_id[section_id]
                section_dict = _section_to_dict(section)
                if section_dict["instructor_id"] != instructor_id:
                    continue
                _, timeslot_set, _, _ = option_data[(section_id, idx)]
                if timeslot_id in timeslot_set:
                    vars_for_slot.append(var)
            if vars_for_slot:
                model.Add(sum(vars_for_slot) <= 1)

    # No-overlap groups cannot overlap in time.
    for group in input_data.no_overlap_groups:
        group_dict = group.to_dict() if hasattr(group, "to_dict") else group
        member_ids = group_dict.get("member_section_ids", []) if isinstance(group_dict, dict) else group.member_section_ids
        for timeslot in input_data.timeslots:
            timeslot_dict = timeslot.to_dict() if hasattr(timeslot, "to_dict") else timeslot
            timeslot_id = timeslot_dict.get("id") if isinstance(timeslot_dict, dict) else timeslot.id
            vars_for_slot = []
            for section_id in member_ids:
                for idx, _ in enumerate(options_by_section.get(section_id, [])):
                    var = option_vars[(section_id, idx)]
                    _, timeslot_set, _, _ = option_data[(section_id, idx)]
                    if timeslot_id in timeslot_set:
                        vars_for_slot.append(var)
            if vars_for_slot:
                model.Add(sum(vars_for_slot) <= 1)

    # Cross-listed sections share times and (optionally) room.
    for group in input_data.crosslist_groups:
        group_dict = group.to_dict() if hasattr(group, "to_dict") else group
        members = group_dict.get("member_section_ids", []) if isinstance(group_dict, dict) else group.member_section_ids
        require_same_room = group_dict.get("require_same_room", False) if isinstance(group_dict, dict) else group.require_same_room
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
                        elif require_same_room and room_a != room_b:
                            model.Add(
                                option_vars[(section_a, idx_a)]
                                + option_vars[(section_b, idx_b)]
                                <= 1
                            )

    # Soft constraint terms for the objective.
    penalty_terms = []
    # Extract unique days from timeslots
    unique_days_set = set()
    for t in input_data.timeslots:
        t_dict = t.to_dict() if hasattr(t, "to_dict") else t
        day = t_dict.get("day") if isinstance(t_dict, dict) else getattr(t, "day", None)
        if day:
            unique_days_set.add(day)
    unique_days = sorted(unique_days_set)

    instructor_day_vars: Dict[Tuple[str, str], cp_model.IntVar] = {}
    adjunct_day_excess_vars: Dict[str, cp_model.IntVar] = {}
    # Track adjunct teaching days for max-teaching-days penalty.
    for instructor in input_data.instructors:
        instructor_dict = _instructor_to_dict(instructor)
        rank_type = instructor_dict["rank_type"]
        preferences = instructor_dict.get("preferences", {})
        max_teaching_days = preferences.get("max_teaching_days") if isinstance(preferences, dict) else (getattr(preferences, "max_teaching_days", None) if preferences else None)
        if rank_type != "Adjunct" or not max_teaching_days:
            continue
        instructor_id = instructor_dict["id"]
        day_vars = []
        for day in unique_days:
            day_var = model.NewBoolVar(f"day_{instructor_id}_{day}")
            instructor_day_vars[(instructor_id, day)] = day_var
            day_vars.append(day_var)
        excess = model.NewIntVar(0, len(unique_days), f"excess_{instructor_id}")
        model.Add(excess >= sum(day_vars) - max_teaching_days)
        model.Add(excess >= 0)
        adjunct_day_excess_vars[instructor_id] = excess
        penalty_terms.append(excess * ADJUNCT_DAY_EXCESS_WEIGHT)

    # Penalties per assignment: room waste, day preference, pattern preference.
    for (section_id, idx), var in option_vars.items():
        pattern_id, timeslot_set, room_id, room_waste = option_data[
            (section_id, idx)
        ]
        section = sections_by_id[section_id]
        section_dict = _section_to_dict(section)
        instructor_id = section_dict["instructor_id"]
        instructor = instructors_by_id.get(instructor_id)
        instructor_dict = _instructor_to_dict(instructor) if instructor else {}
        preferences = instructor_dict.get("preferences", {}) if instructor else {}
        preferred_days = preferences.get("preferred_days", []) if isinstance(preferences, dict) else (getattr(preferences, "preferred_days", []) if preferences else [])
        preferred_patterns = preferences.get("preferred_patterns", []) if isinstance(preferences, dict) else (getattr(preferences, "preferred_patterns", []) if preferences else [])
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
        if instructor and instructor_dict.get("rank_type") == "Adjunct":
            for day in days:
                day_var = instructor_day_vars.get((instructor_id, day))
                if day_var is not None:
                    model.Add(day_var >= var)

    # Soft lock penalties: penalize options that don't match preferred time/room.
    soft_lock_by_section = {}
    for lock in input_data.soft_locks:
        lock_dict = lock.to_dict() if hasattr(lock, "to_dict") else lock
        section_id = lock_dict.get("section_id") if isinstance(lock_dict, dict) else lock.section_id
        soft_lock_by_section[section_id] = lock_dict if isinstance(lock_dict, dict) else lock
    for (section_id, idx), var in option_vars.items():
        soft_lock = soft_lock_by_section.get(section_id)
        if not soft_lock:
            continue
        pattern_id, timeslot_set, room_id, _ = option_data[(section_id, idx)]
        soft_penalty = 0
        # Penalize if timeslot doesn't match preference
        preferred_timeslot_set = soft_lock.get("preferred_timeslot_set") if isinstance(soft_lock, dict) else getattr(soft_lock, "preferred_timeslot_set", None)
        if preferred_timeslot_set:
            if set(timeslot_set) != set(preferred_timeslot_set):
                weight = soft_lock.get("weight") if isinstance(soft_lock, dict) else getattr(soft_lock, "weight", 1.0)
                soft_penalty += weight * SOFT_LOCK_BASE_WEIGHT
        # Penalize if room doesn't match preference
        preferred_room = soft_lock.get("preferred_room") if isinstance(soft_lock, dict) else getattr(soft_lock, "preferred_room", None)
        if preferred_room:
            if room_id != preferred_room:
                weight = soft_lock.get("weight") if isinstance(soft_lock, dict) else getattr(soft_lock, "weight", 1.0)
                soft_penalty += weight * SOFT_LOCK_BASE_WEIGHT
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
                {
                    "code": "infeasible",
                    "message": "No feasible schedule found."
                }
            ],
            "diagnostics": diagnostics,
        }

    assignments: List[dict] = []
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
        section_dict = _section_to_dict(section)
        instructor_id = section_dict["instructor_id"]
        instructor = instructors_by_id.get(instructor_id)
        instructor_dict = _instructor_to_dict(instructor) if instructor else {}
        preferences = instructor_dict.get("preferences", {}) if instructor else {}
        preferred_days = preferences.get("preferred_days", []) if isinstance(preferences, dict) else (getattr(preferences, "preferred_days", []) if preferences else [])
        preferred_patterns = preferences.get("preferred_patterns", []) if isinstance(preferences, dict) else (getattr(preferences, "preferred_patterns", []) if preferences else [])
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
            preferred_timeslot_set = soft_lock.get("preferred_timeslot_set") if isinstance(soft_lock, dict) else getattr(soft_lock, "preferred_timeslot_set", None)
            if preferred_timeslot_set:
                if set(timeslot_set) != set(preferred_timeslot_set):
                    weight = soft_lock.get("weight") if isinstance(soft_lock, dict) else getattr(soft_lock, "weight", 1.0)
                    penalty_breakdown["soft_lock_time"] += float(
                        weight * SOFT_LOCK_BASE_WEIGHT
                    )
            preferred_room = soft_lock.get("preferred_room") if isinstance(soft_lock, dict) else getattr(soft_lock, "preferred_room", None)
            if preferred_room:
                if room_id != preferred_room:
                    weight = soft_lock.get("weight") if isinstance(soft_lock, dict) else getattr(soft_lock, "weight", 1.0)
                    penalty_breakdown["soft_lock_room"] += float(
                        weight * SOFT_LOCK_BASE_WEIGHT
                    )

        assignments.append({
            "section_id": section_id,
            "meeting_pattern_id": pattern_id,
            "timeslot_ids": list(timeslot_set),
            "room_id": room_id,
        })
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
    solution = {
        "assignments": assignments,
        "total_score": total_score,
        "penalty_breakdown": penalty_breakdown,
        "explanations": explanations,
    }
    return {"status": "ok", **solution}


@app.route("/", methods=["GET"])
def read_root():
    return jsonify({"service": "weatherhead-solver", "status": "ok"})


@app.route("/import-excel", methods=["POST"])
def import_excel():
    """
    Accept an Excel file and convert it into data-model-shaped JSON.

    - Multipart/form-data with field name 'file'
    - Optional query param ?persist=true to upsert into the database
    - Response contains both raw records and a 'scheduling_input' payload
      ready to pass to /solve.
    """
    if "file" not in request.files:
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "missing_file",
                            "message": "Upload an Excel file in form field 'file'.",
                        }
                    ],
                }
            ),
            400,
        )

    file = request.files["file"]
    filename = secure_filename(file.filename or "")
    if not filename.lower().endswith((".xlsx", ".xlsm", ".xls")):
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "invalid_file_type",
                            "message": "Only Excel files (.xlsx, .xlsm, .xls) are supported.",
                        }
                    ],
                }
            ),
            400,
        )

    try:
        file_bytes = file.read()
        parsed: ParsedData = build_parsed_data_from_excel(file_bytes)
    except Exception as exc:  # pylint: disable=broad-except
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "parse_failed",
                            "message": f"Failed to parse Excel file: {exc}",
                        }
                    ],
                }
            ),
            400,
        )

    persist_flag = str(request.args.get("persist", "false")).lower() in (
        "1",
        "true",
        "yes",
    )
    if persist_flag:
        persist_parsed_data(parsed)

    scheduling_input = build_scheduling_input_from_parsed(parsed)
    return jsonify(
        {
            "status": "ok",
            "persisted": persist_flag,
            "records": {
                "courses": parsed.courses,
                "instructors": parsed.instructors,
                "rooms": parsed.rooms,
                "timeslots": [
                    {
                        "id": t["id"],
                        "days": t["days"],
                        "start_time": t["start_time"].strftime("%H:%M"),
                        "end_time": t["end_time"].strftime("%H:%M"),
                        "slot_type": t["slot_type"],
                    }
                    for t in parsed.timeslots
                ],
                "meeting_patterns": parsed.meeting_patterns,
                "sections": parsed.sections,
            },
            "scheduling_input": scheduling_input,
        }
    )


@app.route("/solve", methods=["POST"])
def solve():
    data = request.get_json()
    if not data or "input" not in data:
        return jsonify(
            {
                "status": "error",
                "errors": [
                    {
                        "code": "invalid_request",
                        "message": "Missing 'input' field",
                    }
                ],
            }
        ), 400

    input_data = SchedulingInput(data["input"])
    result = _solve_schedule(input_data)
    return jsonify(result)


@app.route("/scheduling-spreadsheet-template", methods=["GET"])
def scheduling_spreadsheet_template():
    workbook_bytes = build_template_bytes()
    response = make_response(workbook_bytes)
    response.headers["Content-Type"] = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    response.headers["Content-Disposition"] = (
        "attachment; filename=scheduling_template.xlsx"
    )
    return response


@app.route("/import-scheduling-spreadsheet", methods=["POST"])
def import_scheduling_spreadsheet():
    if "file" not in request.files:
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "missing_file",
                            "message": "Upload an Excel file in form field 'file'.",
                        }
                    ],
                }
            ),
            400,
        )

    file = request.files["file"]
    filename = secure_filename(file.filename or "")
    if not filename.lower().endswith((".xlsx", ".xlsm", ".xls")):
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "invalid_file_type",
                            "message": "Only Excel files (.xlsx, .xlsm, .xls) are supported.",
                        }
                    ],
                }
            ),
            400,
        )

    try:
        file_bytes = file.read()
        scheduling_input = parse_scheduling_input_from_excel_bytes(file_bytes)
    except Exception as exc:  # pylint: disable=broad-except
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "parse_failed",
                            "message": f"Failed to parse scheduling spreadsheet: {exc}",
                        }
                    ],
                }
            ),
            400,
        )

    try:
        replace_scheduling_data(scheduling_input)
    except Exception as exc:  # pylint: disable=broad-except
        db.session.rollback()
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "persist_failed",
                            "message": f"Failed to persist spreadsheet data: {exc}",
                        }
                    ],
                }
            ),
            500,
        )

    return jsonify({"status": "ok", "scheduling_input": scheduling_input}), 200


@app.route("/export-scheduling-spreadsheet", methods=["POST"])
def export_scheduling_spreadsheet():
    data = request.get_json() or {}
    input_payload = data.get("input") if isinstance(data, dict) and "input" in data else data
    if not isinstance(input_payload, dict):
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "invalid_request",
                            "message": "Request body must be a scheduling input object or { input }.",
                        }
                    ],
                }
            ),
            400,
        )

    try:
        workbook_bytes = scheduling_input_to_excel_bytes(input_payload)
    except Exception as exc:  # pylint: disable=broad-except
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "export_failed",
                            "message": f"Failed to generate spreadsheet: {exc}",
                        }
                    ],
                }
            ),
            500,
        )

    response = make_response(workbook_bytes)
    response.headers["Content-Type"] = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    response.headers["Content-Disposition"] = (
        "attachment; filename=scheduling_export.xlsx"
    )
    return response


@app.route("/update-sections", methods=["POST"])
def update_sections():
    """
    Replace all scheduling-related rows with the provided scheduling input.

    Expects JSON payload matching the frontend `SchedulingInput`:
    {
      sections,
      instructors,
      rooms,
      timeslots,
      meeting_patterns,
      crosslist_groups,
      no_overlap_groups,
      blocked_times,
      locked_assignments,
      soft_locks
    }
    """
    data = request.get_json() or {}
    try:
        replace_scheduling_data(data)
    except ValueError as exc:
        db.session.rollback()
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [{"code": "invalid_request", "message": str(exc)}],
                }
            ),
            400,
        )
    except Exception as exc:  # pylint: disable=broad-except
        db.session.rollback()
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "update_failed",
                            "message": f"Failed to update sections: {exc}",
                        }
                    ],
                }
            ),
            500,
        )

    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    # Create tables if they don't exist
    with app.app_context():
        db.create_all()

    # Run the Flask app
    app.run(debug=True, host="0.0.0.0", port=5001)
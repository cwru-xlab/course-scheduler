from datetime import datetime
from importlib import import_module
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import inspect, text

from flask import Flask, jsonify, make_response, request
from flask_cors import CORS
from ortools.sat.python import cp_model
from werkzeug.utils import secure_filename

try:
    excel_importer = import_module("excel_importer")
    unified_importer = import_module("unified_importer")
    ParsedData = excel_importer.ParsedData
    persist_parsed_data = excel_importer.persist_parsed_data
    build_parsed_data_from_excel = unified_importer.build_parsed_data_from_excel
    build_scheduling_input_from_parsed = (
        unified_importer.build_scheduling_input_from_parsed
    )
except ModuleNotFoundError:
    # Excel import is optional in this branch; keep solver app bootable.
    ParsedData = Any
    persist_parsed_data = None
    build_parsed_data_from_excel = None
    build_scheduling_input_from_parsed = None

from spreadsheet_io.export_to_spreadsheet import scheduling_input_to_excel_bytes
from spreadsheet_io.import_from_spreadsheet import parse_scheduling_input_from_excel_bytes
from spreadsheet_io.spreadsheet_utils import build_template_bytes

from model import (
    BlockedTime,
    CrossListGroup,
    Instructor,
    LockedAssignment,
    MeetingPattern,
    NoOverlapGroup,
    Room,
    ScheduleAssignment,
    ScheduleSolution,
    Section,
    SoftLock,
    Timeslot,
    ValidationError,
    db,
)


"""
CP-SAT course scheduling service:
This file implements three layers of the scheduling system:
1. API Layer: exposes the scheduling system to the user (Flask app).
2. Feasibility Layer: finds feasible schedules (_build_options).
3. Optimization Engine: finds optimal schedules (_solve_schedule).

Workflow:
1. The user sends a request to the API Layer.
2. The API Layer validates the request and sends it to the Feasibility Layer.
3. The Feasibility Layer finds feasible schedules and sends them to the Optimization Engine.
4. The Optimization Engine finds optimal schedules and sends them back to the API Layer.
5. The API Layer returns the schedules to the user.

Expected inputs:
- SchedulingInput: a  data structure containing all courses, sections, instructors, rooms, timeslots, etc.

Expected outputs:
- ScheduleSolution: a schedule that is a list of assignments, each assignment is a tuple of (section_id, timeslot_id, room_id).
"""

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///course_scheduler.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Enable CORS for all routes
CORS(app, origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5001"])

db.init_app(app)

# Objective weights (Changeable).
ROOM_WASTE_WEIGHT = 1           # penalty per empty seat in assigned room
PREF_DAY_WEIGHT = 10            # penalty if days don't match instructor preferences
PREF_PATTERN_WEIGHT = 5         # penalty if pattern isn't preferred by the instructor
ADJUNCT_DAY_EXCESS_WEIGHT = 15  # penalty per day beyond adjunct max for adjuncts
SOFT_LOCK_BASE_WEIGHT = 1       # base multiplier for soft lock penalties
SECTION_PREF_TIME_WEIGHT = 5    # penalty if section is not assigned to its preferred_time

def _ensure_sqlite_schema() -> None:
    """Apply lightweight migrations for SQLite (e.g. new columns on existing DBs)."""
    try:
        engine = db.engine
        if engine.dialect.name != "sqlite":
            return
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        if "sections" not in tables:
            return
        col_names = {c["name"] for c in inspector.get_columns("sections")}
        if "department" in col_names:
            return
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE sections ADD COLUMN department VARCHAR(128) NOT NULL DEFAULT ''"
                )
            )
    except Exception:  # pylint: disable=broad-except
        # Best-effort; create_all / manual migration can fix schema issues.
        pass


# ---------------------------------------------------------------------------
# Input wrapper
# ---------------------------------------------------------------------------

class SchedulingInput:
    def __init__(self, data: dict):
        # Store raw JSON-style data; helper functions below normalize dicts from SQLAlchemy classes.
        self.courses = data.get("courses", [])
        self.majors = data.get("majors", [])
        self.major_preferences = data.get("major_preferences", [])
        self.department_preferences = data.get("department_preferences", [])
        self.section_preferences = data.get("section_preferences", [])
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


def _timeslot_days(timeslots: List[Timeslot]) -> Dict[str, str]:
    """Build a lookup from timeslot ID to day.

    Can now handle timeslots that are either dicts or SQLAlchemy models.
    If a timeslot is missing an ID or day, it will be skipped.

    Args:
        timeslots: All timeslot definitions.

    Returns:
        Mapping of timeslot ID to day string.
    """
    result: Dict[str, str] = {}
    for slot in timeslots:
        # normalize to dict
        if isinstance(slot, dict):
            slot_dict = slot
        elif hasattr(slot, "to_dict"):
            slot_dict = slot.to_dict()
        else:
            # fallback to attribute access
            slot_dict = {"id": getattr(slot, "id", None), "day": getattr(slot, "day", None)}
        slot_id = slot_dict.get("id")
        day = slot_dict.get("day")
        if slot_id is not None and day is not None:
            result[slot_id] = day
    return result


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
        "department": getattr(section, "department", "") or "",
    }


def _room_to_dict(room) -> dict:
    """Convert room (dict or model) to dict."""
    if isinstance(room, dict):
        return room
    return room.to_dict() if hasattr(room, "to_dict") else {
        "id": room.id,
        "building": room.building,
        "capacity": room.capacity,
        "room_type": getattr(room, "room_type", None),
        "has_av": getattr(room, "has_av", False),
        "is_accessible": getattr(room, "is_accessible", True),
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

def _instructors_by_id(input_data: SchedulingInput) -> Dict[str, dict]:
    """Build a lookup of instructor_id -> instructor_dict."""
    result: Dict[str, dict] = {}
    for inst in input_data.instructors:
        inst_dict = _instructor_to_dict(inst)
        inst_id = inst_dict.get("id")
        if inst_id is not None:
            result[inst_id] = inst_dict
    return result

#NEW: grab the section preferences by section ID. section ID -> section preferences dict.
def _section_prefs_by_section_id(input_data: SchedulingInput) -> Dict[str, dict]:
    """Build a lookup of section_id -> section_preferences dict."""
    result: Dict[str, dict] = {}
    for pref in getattr(input_data, "section_preferences", []) or []:
        pref_dict = pref.to_dict() if hasattr(pref, "to_dict") else pref
        if not isinstance(pref_dict, dict):
            continue
        section_id = pref_dict.get("section_id")
        if section_id:
            result[section_id] = pref_dict
    return result


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

    # Lookups used while generating feasible options.
    instructors_by_id = _instructors_by_id(input_data)
    section_prefs_by_id = _section_prefs_by_section_id(input_data)

    for section in input_data.sections:
        section_dict = _section_to_dict(section)
        section_id = section_dict["id"]
        section_prefs = section_prefs_by_id.get(section_id, {})
        # get the instructor for the section
        instructor = instructors_by_id.get(section_dict["instructor_id"])
        # get the unavailable times for the instructor
        unavailable = instructor.get("unavailable_times", []) if instructor else []
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
            # Section-specific allowed_rooms constraint (if provided).
            allowed_rooms = section_prefs.get("allowed_rooms") if isinstance(section_prefs, dict) else None
            if allowed_rooms:
                if room_dict["id"] not in allowed_rooms:
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
                # check if the timeslot is in the instructor's unavailable times
                if any(slot in unavailable for slot in timeslot_set):
                    continue

                # Section-specific allowed_times constraint (if provided).
                allowed_times = section_prefs.get("allowed_times") if isinstance(section_prefs, dict) else None
                if allowed_times:
                    # Only allow timeslot sets where every timeslot is explicitly allowed.
                    if any(slot not in allowed_times for slot in timeslot_set):
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

    section_prefs_by_id_solution = _section_prefs_by_section_id(input_data)

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
            room_dict = _room_to_dict(room)
            room_id = room_dict.get("id")
            for timeslot in input_data.timeslots:
                timeslot_dict = (
                    timeslot.to_dict() if hasattr(timeslot, "to_dict") else timeslot
                )
                current_timeslot_id = (
                    timeslot_dict.get("id")
                    if isinstance(timeslot_dict, dict)
                    else getattr(timeslot, "id", None)
                )
                vars_for_slot = []
                for (section_id, idx), var in option_vars.items():
                    _, option_timeslot_set, option_room_id, _ = option_data[(section_id, idx)]
                    if (
                        option_room_id == room_id
                        and current_timeslot_id in option_timeslot_set
                    ):
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

    # Section-specific cannot_collide_with preferences (simplified version of
    # the main solver constraints). This is only used for feasibility checks,
    # not scoring, and can be disabled via the "section_cannot_collide" key.
    if "section_cannot_collide" not in relax:
        section_prefs_by_id = _section_prefs_by_section_id(input_data)
        seen_pairs: set[Tuple[str, str]] = set()
        for section_id, prefs in section_prefs_by_id.items():
            if not isinstance(prefs, dict):
                continue
            cannot_collide = prefs.get("cannot_collide_with") or {}
            if not isinstance(cannot_collide, dict):
                continue
            for other_id in cannot_collide.keys():
                if other_id not in options_by_section:
                    continue
                pair = tuple(sorted((section_id, other_id)))
                if pair in seen_pairs or pair[0] == pair[1]:
                    continue
                seen_pairs.add(pair)

                a_id, b_id = pair
                options_a = options_by_section.get(a_id, [])
                options_b = options_by_section.get(b_id, [])
                for idx_a, opt_a in enumerate(options_a):
                    _, timeslot_a, _, _ = opt_a
                    for idx_b, opt_b in enumerate(options_b):
                        _, timeslot_b, _, _ = opt_b
                        if set(timeslot_a) & set(timeslot_b):
                            model.Add(
                                option_vars[(a_id, idx_a)]
                                + option_vars[(b_id, idx_b)]
                                <= 1
                            )

    # Major core-course time conflicts: mirror the main solver's behaviour for
    # feasibility checks, disabled via "major_core_conflicts".
    courses_by_id: Dict[str, dict] = {}
    for course in getattr(input_data, "courses", []) or []:
        course_dict = course.to_dict() if hasattr(course, "to_dict") else course
        if isinstance(course_dict, dict) and course_dict.get("id") is not None:
            courses_by_id[course_dict["id"]] = course_dict

    if "major_core_conflicts" not in relax:
        for major_pref in getattr(input_data, "major_preferences", []) or []:
            major_pref_dict = major_pref.to_dict() if hasattr(major_pref, "to_dict") else major_pref
            if not isinstance(major_pref_dict, dict):
                continue
            if not major_pref_dict.get("no_core_conflicts"):
                continue

            core_section_ids = major_pref_dict.get("core_section_ids")
            if core_section_ids is None:
                core_course_ids = major_pref_dict.get("core_course_ids")
                if core_course_ids is None:
                    core_course_ids = [
                        course_id
                        for course_id, course_dict in courses_by_id.items()
                        if course_dict.get("is_core")
                    ]
                core_course_ids_set = set(core_course_ids or [])
                if core_course_ids_set:
                    core_section_ids = [
                        _section_to_dict(s).get("id")
                        for s in input_data.sections
                        if _section_to_dict(s).get("course_id") in core_course_ids_set
                    ]
                else:
                    core_section_ids = []

            core_section_ids = [
                sid for sid in (core_section_ids or []) if sid and sid in options_by_section
            ]
            if len(core_section_ids) < 2:
                continue

            for timeslot in input_data.timeslots:
                timeslot_dict = timeslot.to_dict() if hasattr(timeslot, "to_dict") else timeslot
                timeslot_id = timeslot_dict.get("id") if isinstance(timeslot_dict, dict) else timeslot.id
                vars_for_slot: List[cp_model.IntVar] = []
                for section_id in core_section_ids:
                    for idx, _ in enumerate(options_by_section.get(section_id, [])):
                        var = option_vars[(section_id, idx)]
                        _, timeslot_set, _, _ = option_data[(section_id, idx)]
                        if timeslot_id in timeslot_set:
                            vars_for_slot.append(var)
                if vars_for_slot:
                    model.Add(sum(vars_for_slot) <= 1)

    # Departmental within-department collision rules: if collide_within_department
    # is False, forbid more than one section from that department per timeslot.
    if "department_conflicts" not in relax:
        for dept_pref in getattr(input_data, "department_preferences", []) or []:
            dept_pref_dict = dept_pref.to_dict() if hasattr(dept_pref, "to_dict") else dept_pref
            if not isinstance(dept_pref_dict, dict):
                continue

            department_name = dept_pref_dict.get("department")
            collide_within = dept_pref_dict.get("collide_within_department", True)
            if department_name is None or collide_within:
                continue

            dept_section_ids: List[str] = []
            for s in input_data.sections:
                s_dict = _section_to_dict(s)
                course_id = s_dict.get("course_id")
                course = courses_by_id.get(course_id)
                if course and course.get("department") == department_name:
                    sid = s_dict.get("id")
                    if sid is not None:
                        dept_section_ids.append(sid)

            if len(dept_section_ids) < 2:
                continue

            for timeslot in input_data.timeslots:
                timeslot_dict = timeslot.to_dict() if hasattr(timeslot, "to_dict") else timeslot
                timeslot_id = timeslot_dict.get("id") if isinstance(timeslot_dict, dict) else timeslot.id

                vars_for_slot: List[cp_model.IntVar] = []
                for section_id in dept_section_ids:
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
        ("section_cannot_collide", "Section-level cannot-collide rules"),
        ("major_core_conflicts", "Major core-course no-conflict rules"),
        ("department_conflicts", "Departmental within-department collision rules"),
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


def _extract_referenced_section_ids(
    input_data: SchedulingInput, errors: List[dict]
) -> List[str]:
    section_ids = [_section_to_dict(s).get("id") for s in input_data.sections]
    section_ids = [sid for sid in section_ids if sid]
    referenced: List[str] = []
    for sid in section_ids:
        for err in errors:
            message = str(err.get("message", ""))
            if sid in message:
                referenced.append(sid)
                break
    return referenced


def _build_run_diagnostics(
    input_data: SchedulingInput, options_by_section: Optional[Dict[str, list]] = None
) -> Dict[str, Any]:
    diagnostics: Dict[str, Any] = {}

    room_caps = []
    for room in input_data.rooms:
        room_dict = _room_to_dict(room)
        cap = room_dict.get("capacity")
        if isinstance(cap, (int, float)):
            room_caps.append(int(cap))
    max_room_capacity = max(room_caps) if room_caps else None

    instructor_load: Dict[str, int] = {}
    for section in input_data.sections:
        section_dict = _section_to_dict(section)
        inst_id = section_dict.get("instructor_id")
        if inst_id:
            instructor_load[inst_id] = instructor_load.get(inst_id, 0) + 1
    busiest_instructors = sorted(
        (
            {"instructor_id": inst_id, "section_count": count}
            for inst_id, count in instructor_load.items()
        ),
        key=lambda x: x["section_count"],
        reverse=True,
    )[:8]
    diagnostics["busiest_instructors"] = busiest_instructors

    sections_exceeding_room_capacity = []
    for section in input_data.sections:
        section_dict = _section_to_dict(section)
        section_id = section_dict.get("id")
        enrollment = section_dict.get("expected_enrollment")
        if (
            section_id
            and isinstance(enrollment, (int, float))
            and max_room_capacity is not None
            and enrollment > max_room_capacity
        ):
            sections_exceeding_room_capacity.append(
                {
                    "section_id": section_id,
                    "expected_enrollment": int(enrollment),
                    "max_room_capacity": int(max_room_capacity),
                }
            )
    diagnostics["sections_exceeding_room_capacity"] = sections_exceeding_room_capacity[:10]

    if options_by_section is not None:
        constrained_sections = []
        for section in input_data.sections:
            section_dict = _section_to_dict(section)
            section_id = section_dict.get("id")
            if not section_id:
                continue
            option_count = len(options_by_section.get(section_id, []))
            constrained_sections.append(
                {
                    "section_id": section_id,
                    "course_id": section_dict.get("course_id"),
                    "instructor_id": section_dict.get("instructor_id"),
                    "option_count": option_count,
                    "expected_enrollment": section_dict.get("expected_enrollment"),
                }
            )
        constrained_sections.sort(key=lambda x: (x["option_count"], x["section_id"]))
        diagnostics["most_constrained_sections"] = constrained_sections[:10]

    return diagnostics


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
        error_codes = sorted({str(err.get("code", "unknown")) for err in errors})
        return {
            "status": "error",
            "errors": errors,
            "diagnostics": {
                **_build_run_diagnostics(input_data, options_by_section),
                "error_codes": error_codes,
                "referenced_sections": _extract_referenced_section_ids(input_data, errors),
            },
        }

    # ------------------------------------------------------------------
    # Build optimization model
    # ------------------------------------------------------------------
    model = cp_model.CpModel()
    timeslot_day = _timeslot_days(input_data.timeslots)
    instructors_by_id = _instructors_by_id(input_data)
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

    # Section-specific cannot_collide_with preferences:
    # For each section, enforce that it does not overlap with explicitly forbidden sections.
    section_prefs_by_id = _section_prefs_by_section_id(input_data)
    seen_pairs: set[Tuple[str, str]] = set()
    for section_id, prefs in section_prefs_by_id.items():
        if not isinstance(prefs, dict):
            continue
        cannot_collide = prefs.get("cannot_collide_with") or {}
        if not isinstance(cannot_collide, dict):
            continue
        for other_id in cannot_collide.keys():
            if other_id not in options_by_section:
                continue
            # Avoid duplicating pair constraints.
            pair = tuple(sorted((section_id, other_id)))
            if pair in seen_pairs or pair[0] == pair[1]:
                continue
            seen_pairs.add(pair)

            a_id, b_id = pair
            options_a = options_by_section.get(a_id, [])
            options_b = options_by_section.get(b_id, [])
            for idx_a, opt_a in enumerate(options_a):
                _, timeslot_a, _, _ = opt_a
                for idx_b, opt_b in enumerate(options_b):
                    _, timeslot_b, _, _ = opt_b
                    # If the options share at least one common timeslot, they cannot both be chosen.
                    if set(timeslot_a) & set(timeslot_b):
                        model.Add(
                            option_vars[(a_id, idx_a)]
                            + option_vars[(b_id, idx_b)]
                            <= 1
                        )

    # Major preferences Implementation: prevent core course time overlap.
    #
    # Input hirearchy:
    # major_preferences[].core_section_ids
    # major_preferences[].core_course_ids:
    # input_data.courses[].is_core: fallback
    #
    # NOTE: MajorPreferences.strict_core_scheduling exists in the data model but not implemented yet.
    # constraint can be later added in this block.
    courses_by_id: Dict[str, dict] = {}
    for course in getattr(input_data, "courses", []) or []:
        course_dict = course.to_dict() if hasattr(course, "to_dict") else course
        if isinstance(course_dict, dict) and course_dict.get("id") is not None:
            courses_by_id[course_dict["id"]] = course_dict

    for major_pref in getattr(input_data, "major_preferences", []) or []:
        major_pref_dict = major_pref.to_dict() if hasattr(major_pref, "to_dict") else major_pref
        if not isinstance(major_pref_dict, dict):
            continue
        if not major_pref_dict.get("no_core_conflicts"):
            continue

        core_section_ids = major_pref_dict.get("core_section_ids")
        if core_section_ids is None:
            core_course_ids = major_pref_dict.get("core_course_ids")
            if core_course_ids is None:
                core_course_ids = [
                    course_id
                    for course_id, course_dict in courses_by_id.items()
                    if course_dict.get("is_core")
                ]
            core_course_ids_set = set(core_course_ids or [])
            if core_course_ids_set:
                core_section_ids = [
                    _section_to_dict(s).get("id")
                    for s in input_data.sections
                    if _section_to_dict(s).get("course_id") in core_course_ids_set
                ]
            else:
                core_section_ids = []

        # Filter out faulty section IDs. Maybe log a warning if any were found?
        core_section_ids = [
            sid for sid in (core_section_ids or []) if sid and sid in options_by_section
        ]
        if len(core_section_ids) < 2:
            continue

        for timeslot in input_data.timeslots:
            timeslot_dict = timeslot.to_dict() if hasattr(timeslot, "to_dict") else timeslot
            timeslot_id = timeslot_dict.get("id") if isinstance(timeslot_dict, dict) else timeslot.id
            vars_for_slot: List[cp_model.IntVar] = []
            for section_id in core_section_ids:
                for idx, _ in enumerate(options_by_section.get(section_id, [])):
                    var = option_vars[(section_id, idx)]
                    _, timeslot_set, _, _ = option_data[(section_id, idx)]
                    if timeslot_id in timeslot_set:
                        vars_for_slot.append(var)
            if vars_for_slot:
                model.Add(sum(vars_for_slot) <= 1)

    # Department preferences Implementation: if collide_within_department is False for a department,
    # then at most one section from that department can be scheduled in any
    # given timeslot.
    for dept_pref in getattr(input_data, "department_preferences", []) or []:
        dept_pref_dict = dept_pref.to_dict() if hasattr(dept_pref, "to_dict") else dept_pref
        if not isinstance(dept_pref_dict, dict):
            continue

        department_name = dept_pref_dict.get("department")
        collide_within = dept_pref_dict.get("collide_within_department", True)
        if department_name is None or collide_within:
            # Either no department specified or collisions allowed: skip.
            continue

        # NOTE: DepartmentPreferences.collide_with_other_departments and
        # DepartmentPreferences.allow_virtual are currently ignored here.
        # Later on, implement constraints here.

        # Collect section IDs whose course belongs to this department.
        dept_section_ids: List[str] = []
        for s in input_data.sections:
            s_dict = _section_to_dict(s)
            course_id = s_dict.get("course_id")
            course = courses_by_id.get(course_id)
            if course and course.get("department") == department_name:
                sid = s_dict.get("id")
                if sid is not None:
                    dept_section_ids.append(sid)

        if len(dept_section_ids) < 2:
            continue

        # For each timeslot, enforce: at most one section from this department.
        for timeslot in input_data.timeslots:
            timeslot_dict = timeslot.to_dict() if hasattr(timeslot, "to_dict") else timeslot
            timeslot_id = timeslot_dict.get("id") if isinstance(timeslot_dict, dict) else timeslot.id

            vars_for_slot: List[cp_model.IntVar] = []
            for section_id in dept_section_ids:
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
    section_prefs_by_id = _section_prefs_by_section_id(input_data)

    for (section_id, idx), var in option_vars.items():
        pattern_id, timeslot_set, room_id, room_waste = option_data[(section_id, idx)]
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
        # Section level preferred time: penalty calculation.
        section_prefs = section_prefs_by_id.get(section_id, {})
        pref_time_penalty = 0
        if isinstance(section_prefs, dict):
            preferred_time = section_prefs.get("preferred_time")
            if preferred_time and preferred_time not in timeslot_set:
                pref_time_penalty = SECTION_PREF_TIME_WEIGHT

        total_penalty = (
            room_waste * ROOM_WASTE_WEIGHT
            + pref_day_penalty
            + pref_pattern_penalty
            + pref_time_penalty
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
        # If the underlying course is marked as new, ignore any soft-lock
        # preferences for that section; we want to schedule new courses
        # without being biased by historical context.
        section = sections_by_id[section_id]
        section_dict = _section_to_dict(section)
        course_id = section_dict.get("course_id")
        course = courses_by_id.get(course_id) if course_id else None
        if course and course.get("is_new"):
            continue

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
        diagnostics = {
            **_diagnose_infeasibility(input_data),
            **_build_run_diagnostics(input_data, options_by_section),
        }
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
        "section_preference_penalty": 0.0,
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

        # Section preference penalty breakdown (preferred_time mismatch).
        section_prefs = section_prefs_by_id_solution.get(section_id, {})
        if isinstance(section_prefs, dict):
            preferred_time = section_prefs.get("preferred_time")
            if preferred_time and preferred_time not in timeslot_set:
                penalty_breakdown["section_preference_penalty"] += float(
                    SECTION_PREF_TIME_WEIGHT
                )

        # Calculate soft lock penalties for this assignment (unless the course is new).
        course_id = section_dict.get("course_id")
        course = courses_by_id.get(course_id) if course_id else None
        is_new_course = bool(course and course.get("is_new"))

        soft_lock = soft_lock_by_section.get(section_id)
        if soft_lock and not is_new_course:
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
    if (
        build_parsed_data_from_excel is None
        or build_scheduling_input_from_parsed is None
        or persist_parsed_data is None
    ):
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "excel_import_unavailable",
                            "message": (
                                "Excel import modules are not available in this branch. "
                                "Add excel_importer.py and unified_importer.py to enable /import-excel."
                            ),
                        }
                    ],
                }
            ),
            501,
        )

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
# ---------------------------------------------------------------------------
# Future work / design notes
# ---------------------------------------------------------------------------
# 
#   Unimplemented feautres:
# - MajorPreferences.strict_core_scheduling:
#     Currently unused. Define whether this should enforce stricter timing
#     (e.g., specific bands) or weighting for core courses for a major.
# - DepartmentPreferences.collide_with_other_departments:
#     Currently ignored. Decide whether this forbids overlaps with other
#     departments entirely or only under certain conditions (e.g., core vs
#     elective) and extend the departmental constraint block accordingly.
# - DepartmentPreferences.allow_virtual:
#     There is no explicit virtual-room concept in the solver. Once a
#     representation for virtual sections/rooms is chosen (e.g., special room
#     IDs and capacity rules), room and option-building logic can be updated.
# - Course.is_new and course_non_conflict_association:
#     These flags are available in the ORM but not used in the objective or
#     constraints. When policies for new courses and non-conflicting courses
#     are finalized, they can be translated into additional no-overlap
#     constraints or objective terms, similar to section-level overrides.
# - BlockedTime.scope beyond "global":
#     Only globally-scoped blocked times are applied. Once the meaning of
#     department- or room-scoped blocks is nailed down, _build_options can be
#     extended to apply them during option generation.
# - Infeasibility diagnostics (_diagnose_infeasibility, _check_feasible, relax_candidates list, _strip_section):
#     The current diagnostics do not consider the new variable constraints added.
# - penalty_breakdownAdd section_preference_penalty to the penalty_breakdown dictionary in the final output.
#PS: Cleaning up app.py by adding comments, sections, whitespace. Perhaps split app into multiple files.


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
    Replace all Section rows with the provided list.

    Expects JSON payload: { "sections": [ ... ] } matching the frontend Section type.
    """
    data = request.get_json() or {}
    sections_payload = data.get("sections")
    if not isinstance(sections_payload, list):
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "invalid_request",
                            "message": "Request body must include a 'sections' array.",
                        }
                    ],
                }
            ),
            400,
        )

    try:
        # Clear existing sections
        Section.query.delete()

        skipped_sections: List[Dict[str, Any]] = []
        seen_section_ids = set()

        # Insert all provided sections
        for item in sections_payload:
            # The DB model requires these fields; skip partial spreadsheet rows instead
            # of failing the entire backend update.
            required_keys = ("id", "course_id", "section_code", "instructor_id")
            missing_keys = [
                key
                for key in required_keys
                if item.get(key) is None or str(item.get(key)).strip() == ""
            ]
            if missing_keys:
                skipped_sections.append(
                    {
                        "id": item.get("id"),
                        "missing_required_fields": missing_keys,
                    }
                )
                continue

            section_id = str(item.get("id")).strip()
            if section_id in seen_section_ids:
                skipped_sections.append(
                    {
                        "id": section_id,
                        "duplicate": True,
                        "message": "Duplicate section id in payload; kept first occurrence.",
                    }
                )
                continue
            seen_section_ids.add(section_id)

            dept_raw = item.get("department")
            department = (str(dept_raw).strip() if dept_raw is not None else "") or ""

            section = Section(
                id=section_id,
                course_id=item.get("course_id"),
                section_code=item.get("section_code"),
                instructor_id=item.get("instructor_id"),
                room_id=item.get("room_id"),
                timeslot_id=item.get("timeslot_id"),
                crosslisting_id=item.get("crosslisting_id"),
                expected_enrollment=int(item.get("expected_enrollment") or 0),
                enrollment_cap=int(item.get("enrollment_cap") or 0),
                section_type=item.get("section_type") or "lecture",
                is_crosslisted=bool(item.get("is_crosslisted", False)),
                last_year_time=item.get("last_year_time"),
                last_year_room=item.get("last_year_room"),
                allowed_meeting_patterns=item.get("allowed_meeting_patterns", []),
                room_requirements=item.get("room_requirements", []),
                crosslist_group_id=item.get("crosslist_group_id"),
                tags=item.get("tags", []),
                department=department,
            )
            db.session.add(section)

        db.session.commit()
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

    return (
        jsonify(
            {
                "status": "ok",
                "skipped_sections": skipped_sections,
            }
        ),
        200,
    )


def _parse_time(value):
    if value is None:
        return None
    if hasattr(value, "hour") and hasattr(value, "minute"):
        return value
    raw = str(value).strip()
    for fmt in ("%H:%M", "%H:%M:%S", "%I:%M %p"):
        try:
            return datetime.strptime(raw, fmt).time()
        except ValueError:
            continue
    raise ValueError(f"Invalid time value '{value}'. Expected HH:MM.")


@app.route("/update-instructors", methods=["POST"])
def update_instructors():
    data = request.get_json() or {}
    instructors_payload = data.get("instructors")
    if not isinstance(instructors_payload, list):
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "invalid_request",
                            "message": "Request body must include an 'instructors' array.",
                        }
                    ],
                }
            ),
            400,
        )

    try:
        Instructor.query.delete()
        for item in instructors_payload:
            prefs = item.get("preferences", {}) or {}
            instructor = Instructor(
                id=item.get("id"),
                name=item.get("name") or item.get("id"),
                rank_type=item.get("rank_type") or "Adjunct",
            )
            db.session.add(instructor)
            db.session.flush()
            if prefs:
                pref_model = instructor.preferences
                if pref_model is None:
                    from model import InstructorPreferences

                    pref_model = InstructorPreferences(instructor_id=instructor.id)
                    instructor.preferences = pref_model
                    db.session.add(pref_model)
                pref_model.preferred_times = prefs.get("preferred_times", []) or []
                pref_model.preferred_days = prefs.get("preferred_days", []) or []
                pref_model.preferred_patterns = prefs.get("preferred_patterns", []) or []
                pref_model.unavailable_times = prefs.get("unavailable_times", []) or []
                pref_model.max_teaching_days = prefs.get("max_teaching_days")
        db.session.commit()
    except Exception as exc:  # pylint: disable=broad-except
        db.session.rollback()
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "update_failed",
                            "message": f"Failed to update instructors: {exc}",
                        }
                    ],
                }
            ),
            500,
        )
    return jsonify({"status": "ok"}), 200


@app.route("/update-rooms", methods=["POST"])
def update_rooms():
    data = request.get_json() or {}
    rooms_payload = data.get("rooms")
    if not isinstance(rooms_payload, list):
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "invalid_request",
                            "message": "Request body must include a 'rooms' array.",
                        }
                    ],
                }
            ),
            400,
        )

    try:
        Room.query.delete()
        for item in rooms_payload:
            room = Room(
                id=item.get("id"),
                building=item.get("building") or "Unknown",
                room_number=item.get("room_number") or item.get("id") or "TBD",
                capacity=int(item.get("capacity") or 0),
                room_type=item.get("room_type") or "lecture",
                has_av=bool(item.get("has_av", False)),
                is_accessible=bool(item.get("is_accessible", True)),
                features=item.get("features", []) or [],
            )
            db.session.add(room)
        db.session.commit()
    except Exception as exc:  # pylint: disable=broad-except
        db.session.rollback()
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "update_failed",
                            "message": f"Failed to update rooms: {exc}",
                        }
                    ],
                }
            ),
            500,
        )
    return jsonify({"status": "ok"}), 200


@app.route("/update-timeslots", methods=["POST"])
def update_timeslots():
    data = request.get_json() or {}
    slots_payload = data.get("timeslots")
    if not isinstance(slots_payload, list):
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "invalid_request",
                            "message": "Request body must include a 'timeslots' array.",
                        }
                    ],
                }
            ),
            400,
        )

    try:
        Timeslot.query.delete()
        for item in slots_payload:
            slot = Timeslot(
                id=item.get("id"),
                days=item.get("days") or item.get("day") or "",
                start_time=_parse_time(item.get("start_time")),
                end_time=_parse_time(item.get("end_time")),
                slot_type=item.get("slot_type") or "standard",
            )
            db.session.add(slot)
        db.session.commit()
    except Exception as exc:  # pylint: disable=broad-except
        db.session.rollback()
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "update_failed",
                            "message": f"Failed to update timeslots: {exc}",
                        }
                    ],
                }
            ),
            500,
        )
    return jsonify({"status": "ok"}), 200


@app.route("/update-meeting-patterns", methods=["POST"])
def update_meeting_patterns():
    data = request.get_json() or {}
    patterns_payload = data.get("meeting_patterns")
    if not isinstance(patterns_payload, list):
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "invalid_request",
                            "message": "Request body must include a 'meeting_patterns' array.",
                        }
                    ],
                }
            ),
            400,
        )

    try:
        MeetingPattern.query.delete()
        for item in patterns_payload:
            pattern = MeetingPattern(
                id=item.get("id"),
                slots_required=int(item.get("slots_required") or 1),
                allowed_days=item.get("allowed_days", []) or [],
                compatible_timeslot_sets=item.get("compatible_timeslot_sets", []) or [],
            )
            db.session.add(pattern)
        db.session.commit()
    except Exception as exc:  # pylint: disable=broad-except
        db.session.rollback()
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "update_failed",
                            "message": f"Failed to update meeting patterns: {exc}",
                        }
                    ],
                }
            ),
            500,
        )
    return jsonify({"status": "ok"}), 200


@app.route("/update-constraints", methods=["POST"])
def update_constraints():
    data = request.get_json() or {}
    try:
        CrossListGroup.query.delete()
        NoOverlapGroup.query.delete()
        BlockedTime.query.delete()
        LockedAssignment.query.delete()
        SoftLock.query.delete()

        for item in data.get("crosslist_groups", []) or []:
            db.session.add(
                CrossListGroup(
                    id=item.get("id"),
                    member_section_ids=item.get("member_section_ids", []) or [],
                    require_same_room=bool(item.get("require_same_room", False)),
                )
            )

        for item in data.get("no_overlap_groups", []) or []:
            db.session.add(
                NoOverlapGroup(
                    id=item.get("id"),
                    member_section_ids=item.get("member_section_ids", []) or [],
                    reason=item.get("reason") or "constraint",
                )
            )

        for item in data.get("blocked_times", []) or []:
            db.session.add(
                BlockedTime(
                    scope=item.get("scope") or "global",
                    timeslot_ids=item.get("timeslot_ids", []) or [],
                    reason=item.get("reason") or "blocked",
                )
            )

        for item in data.get("locked_assignments", []) or []:
            db.session.add(
                LockedAssignment(
                    section_id=item.get("section_id"),
                    fixed_timeslot_set=item.get("fixed_timeslot_set"),
                    fixed_room=item.get("fixed_room"),
                )
            )

        for item in data.get("soft_locks", []) or []:
            db.session.add(
                SoftLock(
                    section_id=item.get("section_id"),
                    preferred_timeslot_set=item.get("preferred_timeslot_set"),
                    preferred_room=item.get("preferred_room"),
                    weight=float(item.get("weight", 1.0)),
                )
            )

        db.session.commit()
    except Exception as exc:  # pylint: disable=broad-except
        db.session.rollback()
        return (
            jsonify(
                {
                    "status": "error",
                    "errors": [
                        {
                            "code": "update_failed",
                            "message": f"Failed to update constraints: {exc}",
                        }
                    ],
                }
            ),
            500,
        )
    return jsonify({"status": "ok"}), 200


# Ensure schema on import (covers `flask run` / gunicorn, not only `python app.py`).
with app.app_context():
    db.create_all()
    _ensure_sqlite_schema()


if __name__ == "__main__":
    # Run the Flask app
    app.run(debug=True, host="0.0.0.0", port=5001)

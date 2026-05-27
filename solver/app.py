from datetime import datetime
import os
import re
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
from spreadsheet_io.spreadsheet_utils import build_template_bytes, parse_nested_list_cell

from model import (
    BlockedTime,
    Course,
    CrossListGroup,
    Instructor,
    InstructorPreferences,
    LockedAssignment,
    MeetingPattern,
    NoOverlapGroup,
    Room,
    RoomPreferences,
    ScheduleAssignment,
    ScheduleSolution,
    Section,
    SectionPreferences,
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

_db_backend = os.environ.get("DB_BACKEND", "sqlite").lower()
if _db_backend == "postgres":
    _database_url = os.environ.get("DATABASE_URL")
    if not _database_url:
        raise RuntimeError(
            "DB_BACKEND=postgres but DATABASE_URL is not set. "
            "Provide a PostgreSQL connection string, e.g. "
            "postgresql://user:pass@host:5432/dbname"
        )
    if _database_url.startswith("postgres://"):
        _database_url = _database_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif _database_url.startswith("postgresql://"):
        _database_url = _database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    app.config["SQLALCHEMY_DATABASE_URI"] = _database_url
else:
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

def _seed_if_empty() -> None:
    """Auto-seed timeslots, meeting patterns, rooms, and instructors when DB is empty."""
    import json
    from pathlib import Path
    from datetime import time as dt_time

    base = Path(__file__).resolve().parent

    if Timeslot.query.first() is None:
        ts_path = base / "timeslot-handler" / "seed_timeslots.json"
        if ts_path.exists():
            for row in json.loads(ts_path.read_text()):
                h1, m1, s1 = row["start_time"].split(":")
                h2, m2, s2 = row["end_time"].split(":")
                db.session.add(Timeslot(
                    id=row["id"],
                    days=row["days"],
                    start_time=dt_time(int(h1), int(m1), int(s1)),
                    end_time=dt_time(int(h2), int(m2), int(s2)),
                    slot_type=row["slot_type"],
                ))
            db.session.flush()
            print(f"[seed] Timeslots seeded from {ts_path}")

    if MeetingPattern.query.first() is None:
        mp_path = base / "timeslot-handler" / "seed_meeting_patterns.json"
        if mp_path.exists():
            for row in json.loads(mp_path.read_text()):
                db.session.add(MeetingPattern(
                    id=row["id"],
                    slots_required=row["slots_required"],
                    allowed_days=row["allowed_days"],
                    compatible_timeslot_sets=row["compatible_timeslot_sets"],
                ))
            db.session.flush()
            print(f"[seed] MeetingPatterns seeded from {mp_path}")

    if Room.query.first() is None:
        rooms_path = base / "room-handler" / "rooms.json"
        if rooms_path.exists():
            for row in json.loads(rooms_path.read_text()):
                db.session.add(Room(
                    id=row["id"],
                    building=row["building"],
                    room_number=row["room_number"],
                    capacity=row["capacity"],
                    room_type=row["room_type"],
                    has_av=row["has_av"],
                    is_accessible=row["is_accessible"],
                    features=row.get("features", []),
                ))
            db.session.flush()
            print(f"[seed] Rooms seeded from {rooms_path}")

        prefs_path = base / "room-handler" / "room_preferences.json"
        if prefs_path.exists():
            from model import RoomPreferences
            for row in json.loads(prefs_path.read_text()):
                db.session.add(RoomPreferences(
                    room_id=row["room_id"],
                    need_projector=row["need_projector"],
                    need_lab=row["need_lab"],
                    can_be_outside_weatherhead=row["can_be_outside_weatherhead"],
                    other_requirements=row.get("other_requirements") or {},
                ))
            db.session.flush()
            print(f"[seed] RoomPreferences seeded from {prefs_path}")

    if Instructor.query.first() is None:
        inst_path = base / "instructor-handler" / "seed_instructors.json"
        if inst_path.exists():
            for row in json.loads(inst_path.read_text()):
                db.session.add(Instructor(
                    id=row["id"],
                    name=row["name"],
                    rank_type=row["rank_type"],
                ))
            db.session.flush()
            print(f"[seed] Instructors seeded from {inst_path}")

    db.session.commit()


def _ensure_schema_migrations() -> None:
    """Apply lightweight column migrations for existing DBs (SQLite and Postgres)."""
    try:
        engine = db.engine
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        with engine.begin() as conn:
            if "sections" in tables:
                section_cols = {c["name"] for c in inspector.get_columns("sections")}
                if "department" not in section_cols:
                    conn.execute(
                        text(
                            "ALTER TABLE sections ADD COLUMN department VARCHAR(128) NOT NULL DEFAULT ''"
                        )
                    )
            if "blocked_times" in tables:
                blocked_cols = {c["name"] for c in inspector.get_columns("blocked_times")}
                if "days" not in blocked_cols:
                    conn.execute(text("ALTER TABLE blocked_times ADD COLUMN days VARCHAR(32)"))
                if "start_time" not in blocked_cols:
                    conn.execute(text("ALTER TABLE blocked_times ADD COLUMN start_time VARCHAR(16)"))
                if "end_time" not in blocked_cols:
                    conn.execute(text("ALTER TABLE blocked_times ADD COLUMN end_time VARCHAR(16)"))
            if "crosslist_groups" in tables:
                crosslist_cols = [c["name"] for c in inspector.get_columns("crosslist_groups")]
                if "require_same_room" in crosslist_cols:
                    # Drop obsolete legacy column by table rebuild for SQLite compatibility.
                    conn.execute(
                        text(
                            """
                            CREATE TABLE IF NOT EXISTS crosslist_groups_new (
                                id VARCHAR PRIMARY KEY,
                                member_section_ids JSON NOT NULL
                            )
                            """
                        )
                    )
                    conn.execute(
                        text(
                            """
                            INSERT INTO crosslist_groups_new (id, member_section_ids)
                            SELECT id, member_section_ids
                            FROM crosslist_groups
                            """
                        )
                    )
                    conn.execute(text("DROP TABLE crosslist_groups"))
                    conn.execute(text("ALTER TABLE crosslist_groups_new RENAME TO crosslist_groups"))
    except Exception:  # pylint: disable=broad-except
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
        day = slot_dict.get("day") or slot_dict.get("days")
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


def _build_overlapping_timeslot_pairs(timeslots: List) -> set:
    """Build a set of (ts_id_a, ts_id_b) pairs where the two timeslots overlap in time on the same day.

    Two timeslots overlap if they share at least one day AND their time ranges intersect.
    Multi-day strings (e.g. "MWF", "TR", "Monday,Wednesday") are expanded into
    individual day tokens so that e.g. "MWF" and "MW" are correctly recognised as
    sharing days Monday and Wednesday.
    Only pairs where ts_id_a < ts_id_b are included to avoid duplicates.
    """
    # (id, frozenset_of_day_tokens, start_str, end_str)
    slot_info: List[Tuple[str, frozenset, str, str]] = []
    for ts in timeslots:
        d = ts.to_dict() if hasattr(ts, "to_dict") else ts
        if not isinstance(d, dict):
            continue
        ts_id = str(d.get("id", ""))
        raw_day = d.get("day") or d.get("days") or ""
        start = d.get("start_time", "")
        end = d.get("end_time", "")
        # Normalize times to strings for comparison
        if hasattr(start, "strftime"):
            start = start.strftime("%H:%M")
        if hasattr(end, "strftime"):
            end = end.strftime("%H:%M")
        # Expand multi-day strings into individual day tokens using the existing
        # _normalize_day_tokens helper so all formats are handled uniformly.
        day_tokens = _normalize_day_tokens(raw_day)
        slot_info.append((ts_id, frozenset(day_tokens), str(start), str(end)))

    overlaps: set = set()
    for i in range(len(slot_info)):
        id_a, days_a, start_a, end_a = slot_info[i]
        for j in range(i + 1, len(slot_info)):
            id_b, days_b, start_b, end_b = slot_info[j]
            # Only check time overlap if the two slots share at least one day.
            if days_a & days_b and start_a < end_b and start_b < end_a:
                pair = (min(id_a, id_b), max(id_a, id_b))
                overlaps.add(pair)
    return overlaps


def _timeslot_overlaps_block_range(timeslot: dict, blocked: dict) -> bool:
    """Return True when timeslot overlaps blocked day/time range."""
    blocked_days = _normalize_day_tokens(blocked.get("days"))
    if not blocked_days:
        return False
    slot_days = _normalize_day_tokens(timeslot.get("day") or timeslot.get("days"))
    if not (blocked_days & slot_days):
        return False

    try:
        blocked_start = _parse_time(blocked.get("start_time"))
        blocked_end = _parse_time(blocked.get("end_time"))
        slot_start = _parse_time(timeslot.get("start_time"))
        slot_end = _parse_time(timeslot.get("end_time"))
    except ValueError:
        return False
    if not blocked_start or not blocked_end or not slot_start or not slot_end:
        return False
    return slot_start < blocked_end and blocked_start < slot_end


_COMPACT_SCHEDULE_DAYS_RE = re.compile(r"^[MTWRFSU]+$", re.IGNORECASE)

_FULL_DAY_NAME_TO_CODE = {
    "monday": "M",
    "tuesday": "T",
    "wednesday": "W",
    "thursday": "R",
    "friday": "F",
    "saturday": "S",
    "sunday": "U",
}


def _expand_schedule_day_token(token: str) -> set:
    """Turn one day field token into single-letter codes (M,T,W,R,F,S,U).

    Handles compact academic strings like MWF, TR, MW next to comma-separated
    or list forms like M, W, F.
    """
    t = token.strip()
    if not t:
        return set()
    key = t.lower().replace(".", "")
    if key in _FULL_DAY_NAME_TO_CODE:
        return {_FULL_DAY_NAME_TO_CODE[key]}
    if _COMPACT_SCHEDULE_DAYS_RE.fullmatch(t):
        return {c.upper() for c in t}
    return {t}


def _normalize_day_tokens(value: Any) -> set:
    """Normalize day strings/lists into a canonical token set."""
    if value is None:
        return set()
    if isinstance(value, list):
        tokens = [str(v).strip() for v in value]
    else:
        normalized = str(value).replace("/", ",")
        tokens = [part.strip() for part in normalized.split(",")]
    out: set = set()
    for token in tokens:
        if token:
            out.update(_expand_schedule_day_token(token))
    return out


def _normalize_compatible_timeslot_sets(
    pattern_dict: dict,
    timeslots: List,
) -> List[List[str]]:
    """Normalize meeting-pattern timeslot sets for known flattened legacy shape.

    Some datasets store alternatives as a single flat set, e.g. [[6,7,8]], where each
    timeslot already represents a full Tue/Thu block. In that case, split to
    [[6],[7],[8]] so each item is treated as an alternative, not one combined meeting.
    """
    raw_sets = pattern_dict.get("compatible_timeslot_sets", [])
    if isinstance(raw_sets, str):
        raw_sets = parse_nested_list_cell(raw_sets)
    cleaned: List[List[str]] = []
    for item in raw_sets if isinstance(raw_sets, list) else []:
        if isinstance(item, list):
            cleaned.append([str(slot_id) for slot_id in item if slot_id is not None])
    if len(cleaned) != 1:
        return cleaned

    only_set = cleaned[0]
    if len(only_set) <= 1:
        return cleaned

    allowed_days = _normalize_day_tokens(pattern_dict.get("allowed_days", []))
    if not allowed_days:
        return cleaned

    timeslot_days_by_id: Dict[str, set] = {}
    for timeslot in timeslots:
        slot_dict = timeslot.to_dict() if hasattr(timeslot, "to_dict") else timeslot
        if not isinstance(slot_dict, dict):
            continue
        slot_id = slot_dict.get("id")
        if not slot_id:
            continue
        slot_days = slot_dict.get("day")
        if slot_days is None:
            slot_days = slot_dict.get("days")
        timeslot_days_by_id[str(slot_id)] = _normalize_day_tokens(slot_days)

    if all(timeslot_days_by_id.get(slot_id) == allowed_days for slot_id in only_set):
        return [[slot_id] for slot_id in only_set]

    return cleaned


def _required_section_capacity(section: Any) -> int:
    """Return the minimum room capacity required for a section.

    Prefer enrollment_cap when provided, otherwise fall back to expected_enrollment.
    """
    section_dict = _section_to_dict(section)
    enrollment_cap = section_dict.get("enrollment_cap")
    expected_enrollment = section_dict.get("expected_enrollment")
    if isinstance(enrollment_cap, (int, float)) and enrollment_cap > 0:
        return int(enrollment_cap)
    if isinstance(expected_enrollment, (int, float)) and expected_enrollment > 0:
        return int(expected_enrollment)
    return 0


def _build_section_to_crosslist_group(crosslists: List, sections: List) -> Dict[str, str]:
    """Build canonical section -> cross-list group mapping.

    Membership declared in cross-list groups is authoritative; section.crosslist_group_id
    is used as a fallback for sections not explicitly listed in a group.
    """
    section_ids = {
        _section_to_dict(section).get("id")
        for section in sections
        if _section_to_dict(section).get("id")
    }
    section_to_group: Dict[str, str] = {}

    for group in crosslists:
        group_dict = group.to_dict() if hasattr(group, "to_dict") else group
        group_id = group_dict.get("id") if isinstance(group_dict, dict) else group.id
        if group_id is None:
            continue
        members = group_dict.get("member_section_ids", []) if isinstance(group_dict, dict) else group.member_section_ids
        for member in members or []:
            member_id = str(member)
            if member_id in section_ids:
                section_to_group[member_id] = str(group_id)

    for section in sections:
        section_dict = _section_to_dict(section)
        section_id = section_dict.get("id")
        crosslist_id = section_dict.get("crosslist_group_id")
        if section_id and crosslist_id and section_id not in section_to_group:
            section_to_group[str(section_id)] = str(crosslist_id)

    return section_to_group


def _build_crosslist_totals(crosslists: List, sections: List) -> Dict[str, int]:
    """Compute total required seats per cross-list group.

    Args:
        sections: All section definitions.

    Returns:
        Mapping of cross-list group ID to summed required section capacity.
    """
    totals: Dict[str, int] = {}
    section_to_group = _build_section_to_crosslist_group(crosslists, sections)
    for section in sections:
        section_dict = _section_to_dict(section)
        section_id = section_dict.get("id")
        crosslist_id = section_to_group.get(str(section_id)) if section_id else None
        if crosslist_id:
            totals.setdefault(crosslist_id, 0)
            totals[crosslist_id] += _required_section_capacity(section_dict)
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
    total_by_group = _build_crosslist_totals(crosslists, sections)
    for group in crosslists:
        group_dict = group.to_dict() if hasattr(group, "to_dict") else group
        group_id = group_dict.get("id") if isinstance(group_dict, dict) else group.id
        if group_id is None:
            continue
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
    timeslots_by_id: Dict[str, dict] = {}
    for timeslot in input_data.timeslots:
        slot_dict = timeslot.to_dict() if hasattr(timeslot, "to_dict") else timeslot
        if not isinstance(slot_dict, dict):
            continue
        ts_id = slot_dict.get("id")
        if ts_id is not None:
            timeslots_by_id[str(ts_id)] = slot_dict

    if not ignore_blocked_times:
        for blocked in input_data.blocked_times:
            blocked_dict = blocked.to_dict() if hasattr(blocked, "to_dict") else blocked
            scope = blocked_dict.get("scope") if isinstance(blocked_dict, dict) else blocked.scope
            if scope == "global":
                normalized_block = blocked_dict if isinstance(blocked_dict, dict) else {}
                # Legacy explicit timeslot IDs still supported.
                blocked_times_global.update(normalized_block.get("timeslot_ids", []) or [])
                # New behavior: range + days drives overlap filtering.
                if (
                    normalized_block.get("days")
                    and normalized_block.get("start_time")
                    and normalized_block.get("end_time")
                ):
                    for ts_id, slot_dict in timeslots_by_id.items():
                        if _timeslot_overlaps_block_range(slot_dict, normalized_block):
                            blocked_times_global.add(ts_id)

    section_to_crosslist_group = _build_section_to_crosslist_group(
        input_data.crosslist_groups, input_data.sections
    )
    crosslist_totals = _build_crosslist_totals(input_data.crosslist_groups, input_data.sections)
    options_by_section: Dict[str, List[Tuple[str, Tuple[str, ...], str, int]]] = {}
    errors: List[dict] = []

    # Lookups used while generating feasible options.
    instructors_by_id = _instructors_by_id(input_data)
    section_prefs_by_id = _section_prefs_by_section_id(input_data)

    for section in input_data.sections:
        section_dict = _section_to_dict(section)
        section_id = section_dict["id"]
        required_capacity = _required_section_capacity(section_dict)
        section_prefs = section_prefs_by_id.get(section_id, {})
        # get the instructor for the section
        instructor = instructors_by_id.get(section_dict["instructor_id"])
        # get the unavailable times for the instructor
        unavailable = instructor.get("unavailable_times", []) if instructor else []
        lock = locked_by_section.get(section_id)
        available_rooms = []
        for room in input_data.rooms:
            room_dict = _room_to_dict(room)
            if not ignore_room_capacity and room_dict["capacity"] < required_capacity:
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
        crosslist_id = section_to_crosslist_group.get(section_id)
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
            compatible_sets = _normalize_compatible_timeslot_sets(
                pattern_dict, input_data.timeslots
            )
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
                            room["capacity"] - required_capacity,
                        )
                    )

        if not section_options:
            errors.append({
                "code": "no_feasible_options",
                "message": f"Section {section_id} has no feasible assignment options.",
            })
        options_by_section[section_id] = section_options

    return options_by_section, errors


def _strip_instructor(input_data: SchedulingInput, instructor_id: str) -> SchedulingInput:
    """Return input data with all sections for an instructor removed."""
    section_ids_to_remove = set()
    for s in input_data.sections:
        s_dict = _section_to_dict(s)
        if s_dict.get("instructor_id") == instructor_id:
            section_ids_to_remove.add(s_dict["id"])

    remaining_sections = [
        s for s in input_data.sections
        if _section_to_dict(s)["id"] not in section_ids_to_remove
    ]
    remaining_crosslists = []
    for group in input_data.crosslist_groups:
        group_dict = group.to_dict() if hasattr(group, "to_dict") else group
        members = [sid for sid in group_dict.get("member_section_ids", []) if sid not in section_ids_to_remove]
        if len(members) >= 2:
            remaining_crosslists.append({
                "id": group_dict.get("id") if isinstance(group_dict, dict) else group.id,
                "member_section_ids": members,
            })
    remaining_no_overlap = []
    for group in input_data.no_overlap_groups:
        group_dict = group.to_dict() if hasattr(group, "to_dict") else group
        members = [sid for sid in group_dict.get("member_section_ids", []) if sid not in section_ids_to_remove]
        if len(members) >= 2:
            remaining_no_overlap.append({
                "id": group_dict.get("id") if isinstance(group_dict, dict) else group.id,
                "member_section_ids": members,
                "reason": group_dict.get("reason") if isinstance(group_dict, dict) else group.reason,
            })
    remaining_locks = [
        lock for lock in input_data.locked_assignments
        if (lock.to_dict() if hasattr(lock, "to_dict") else lock).get("section_id") not in section_ids_to_remove
    ]
    remaining_soft_locks = [
        lock for lock in input_data.soft_locks
        if (lock.to_dict() if hasattr(lock, "to_dict") else lock).get("section_id") not in section_ids_to_remove
    ]

    return SchedulingInput({
        "courses": input_data.courses,
        "majors": input_data.majors,
        "major_preferences": input_data.major_preferences,
        "department_preferences": input_data.department_preferences,
        "section_preferences": input_data.section_preferences,
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
    input_data = _split_placeholder_instructors(input_data, quiet=True)
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
    section_to_crosslist_group = _build_section_to_crosslist_group(
        input_data.crosslist_groups, input_data.sections
    )

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

    # Pre-index for O(1) lookups (same approach as _solve_schedule).
    vars_by_room_timeslot: Dict[Tuple[str, str], List[Tuple[str, int, cp_model.IntVar]]] = {}
    vars_by_instructor_timeslot: Dict[
        Tuple[str, str], List[Tuple[str, cp_model.IntVar]]
    ] = {}
    vars_by_section_timeslot: Dict[Tuple[str, str], List[cp_model.IntVar]] = {}

    for (section_id, idx), var in option_vars.items():
        _, timeslot_set, room_id, _ = option_data[(section_id, idx)]
        section_dict = _section_to_dict(sections_by_id[section_id])
        instructor_id = section_dict["instructor_id"]
        for ts_id in timeslot_set:
            vars_by_room_timeslot.setdefault((room_id, ts_id), []).append(
                (section_id, idx, var)
            )
            vars_by_instructor_timeslot.setdefault((instructor_id, ts_id), []).append(
                (section_id, var)
            )
            vars_by_section_timeslot.setdefault((section_id, ts_id), []).append(var)

    all_timeslot_ids = []
    for timeslot in input_data.timeslots:
        timeslot_dict = timeslot.to_dict() if hasattr(timeslot, "to_dict") else timeslot
        all_timeslot_ids.append(
            timeslot_dict.get("id") if isinstance(timeslot_dict, dict) else timeslot.id
        )

    overlapping_pairs_feas = _build_overlapping_timeslot_pairs(input_data.timeslots)

    if "room_conflicts" not in relax:
        for room in input_data.rooms:
            room_id = (_room_to_dict(room)).get("id")
            for timeslot_id in all_timeslot_ids:
                entries = vars_by_room_timeslot.get((room_id, timeslot_id))
                if not entries or len(entries) <= 1:
                    continue
                vars_for_slot = [var for _, _, var in entries]
                model.Add(sum(vars_for_slot) <= 1)
            for ts_a, ts_b in overlapping_pairs_feas:
                entries_a = vars_by_room_timeslot.get((room_id, ts_a))
                entries_b = vars_by_room_timeslot.get((room_id, ts_b))
                if not entries_a or not entries_b:
                    continue
                merged_vars: List[cp_model.IntVar] = []
                seen_var: set[int] = set()
                for _, _, v in entries_a + entries_b:
                    vid = id(v)
                    if vid not in seen_var:
                        seen_var.add(vid)
                        merged_vars.append(v)
                if len(merged_vars) > 1:
                    model.Add(sum(merged_vars) <= 1)

    if "instructor_conflicts" not in relax:
        for instructor in input_data.instructors:
            instructor_id = (_instructor_to_dict(instructor))["id"]
            for timeslot_id in all_timeslot_ids:
                entries_for_slot = vars_by_instructor_timeslot.get(
                    (instructor_id, timeslot_id)
                )
                if entries_for_slot and len(entries_for_slot) > 1:
                    vars_by_group: Dict[str, List[cp_model.IntVar]] = {}
                    for section_id, var in entries_for_slot:
                        group_key = section_to_crosslist_group.get(
                            section_id, f"sec:{section_id}"
                        )
                        vars_by_group.setdefault(group_key, []).append(var)
                    if len(vars_by_group) > 1:
                        group_used_vars = []
                        for group_key, vars_for_group in vars_by_group.items():
                            group_used = model.NewBoolVar(
                                f"feas_inst_use_{instructor_id}_{timeslot_id}_{group_key}"
                            )
                            for var in vars_for_group:
                                model.Add(group_used >= var)
                            group_used_vars.append(group_used)
                        model.Add(sum(group_used_vars) <= 1)
            for ts_a, ts_b in overlapping_pairs_feas:
                entries_a = vars_by_instructor_timeslot.get((instructor_id, ts_a), [])
                entries_b = vars_by_instructor_timeslot.get((instructor_id, ts_b), [])
                if entries_a and entries_b:
                    vars_by_group_cross: Dict[str, List[cp_model.IntVar]] = {}
                    for section_id, var in entries_a + entries_b:
                        group_key = section_to_crosslist_group.get(
                            section_id, f"sec:{section_id}"
                        )
                        vars_by_group_cross.setdefault(group_key, []).append(var)
                    if len(vars_by_group_cross) > 1:
                        group_used_vars = []
                        for group_key, vars_for_group in vars_by_group_cross.items():
                            group_used = model.NewBoolVar(
                                f"feas_inst_overlap_{instructor_id}_{ts_a}_{ts_b}_{group_key}"
                            )
                            for var in vars_for_group:
                                model.Add(group_used >= var)
                            group_used_vars.append(group_used)
                        model.Add(sum(group_used_vars) <= 1)

    if "no_overlap_groups" not in relax:
        for group in input_data.no_overlap_groups:
            group_dict = group.to_dict() if hasattr(group, "to_dict") else group
            member_ids = group_dict.get("member_section_ids", []) if isinstance(group_dict, dict) else group.member_section_ids
            for timeslot_id in all_timeslot_ids:
                vars_for_slot = []
                for section_id in member_ids:
                    slot_vars = vars_by_section_timeslot.get((section_id, timeslot_id))
                    if slot_vars:
                        vars_for_slot.extend(slot_vars)
                if len(vars_for_slot) > 1:
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
                pair: Tuple[str, str] = (min(section_id, other_id), max(section_id, other_id))
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

            for timeslot_id in all_timeslot_ids:
                vars_for_slot: List[cp_model.IntVar] = []
                for section_id in core_section_ids:
                    slot_vars = vars_by_section_timeslot.get((section_id, timeslot_id))
                    if slot_vars:
                        vars_for_slot.extend(slot_vars)
                if len(vars_for_slot) > 1:
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
                course = courses_by_id.get(course_id) if course_id else None
                if course and course.get("department") == department_name:
                    sid = s_dict.get("id")
                    if sid is not None:
                        dept_section_ids.append(sid)

            if len(dept_section_ids) < 2:
                continue

            for timeslot_id in all_timeslot_ids:
                vars_for_slot: List[cp_model.IntVar] = []
                for section_id in dept_section_ids:
                    slot_vars = vars_by_section_timeslot.get((section_id, timeslot_id))
                    if slot_vars:
                        vars_for_slot.extend(slot_vars)
                if len(vars_for_slot) > 1:
                    model.Add(sum(vars_for_slot) <= 1)

    if "crosslist_time_room" not in relax:
        for group in input_data.crosslist_groups:
            group_dict = group.to_dict() if hasattr(group, "to_dict") else group
            members = group_dict.get("member_section_ids", []) if isinstance(group_dict, dict) else group.member_section_ids
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
                            elif room_a != room_b:
                                model.Add(
                                    option_vars[(section_a, idx_a)]
                                    + option_vars[(section_b, idx_b)]
                                    <= 1
                                )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 120.0
    solver.parameters.num_workers = 2
    solver.parameters.random_seed = 0
    status = solver.Solve(model)
    return status in (cp_model.OPTIMAL, cp_model.FEASIBLE)


def _diagnose_infeasibility(input_data: SchedulingInput) -> Dict[str, List[str]]:
    """Suggest single-step relaxations/removals that restore feasibility.

    Args:
        input_data: Full scheduling input.

    Returns:
        Diagnostics with two lists:
            - feasible_if_relax: constraint families to relax.
            - feasible_if_remove_instructor: instructors whose sections can be removed.
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
        print(f"[diagnose] Testing relaxation: {label}...", flush=True)
        if _check_feasible(input_data, {relax_key}):
            feasible_if_relax.append(label)

    feasible_if_remove_instructor: List[dict] = []
    instructor_load: Dict[str, int] = {}
    for section in input_data.sections:
        inst_id = _section_to_dict(section).get("instructor_id")
        if inst_id:
            instructor_load[inst_id] = instructor_load.get(inst_id, 0) + 1

    sorted_instructors = sorted(instructor_load.items(), key=lambda x: x[1], reverse=True)
    total_sections = len(input_data.sections)
    print(f"[diagnose] Testing cumulative instructor removal (busiest first, {len(sorted_instructors)} instructors, {total_sections} sections)...", flush=True)
    current_data = input_data
    removed_sections = 0
    for instructor_id, count in sorted_instructors:
        current_data = _strip_instructor(current_data, instructor_id)
        removed_sections += count
        feasible_if_remove_instructor.append({
            "instructor_id": instructor_id,
            "section_count": count,
        })
        remaining = total_sections - removed_sections
        print(
            f"[diagnose]   #{len(feasible_if_remove_instructor)}: Removed {instructor_id} ({count} sections) "
            f"| total removed: {removed_sections}/{total_sections} | remaining: {remaining} | testing...",
            flush=True,
        )
        if _check_feasible(current_data):
            print(
                f"[diagnose]   FEASIBLE after removing {len(feasible_if_remove_instructor)} instructor(s), "
                f"{removed_sections} sections",
                flush=True,
            )
            break
        else:
            print(f"[diagnose]   still infeasible", flush=True)

    return {
        "feasible_if_relax": feasible_if_relax,
        "feasible_if_remove_instructor": feasible_if_remove_instructor,
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
        enrollment = _required_section_capacity(section_dict)
        if (
            section_id
            and isinstance(enrollment, int)
            and max_room_capacity is not None
            and enrollment > max_room_capacity
        ):
            sections_exceeding_room_capacity.append(
                {
                    "section_id": section_id,
                    "required_capacity": int(enrollment),
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


PLACEHOLDER_INSTRUCTORS = {"staff", "tbd", "tba"}


def _split_placeholder_instructors(input_data: SchedulingInput, quiet: bool = False) -> SchedulingInput:
    """Split placeholder instructors (e.g. 'Staff') into unique per-section instructors.

    If multiple sections share a placeholder instructor ID, they'd be subject to
    the instructor overlap constraint, making the problem infeasible. This creates
    distinct instructor IDs (Staff__1, Staff__2, ...) so each section is independent.
    """
    instructor_map = {}
    for inst in input_data.instructors:
        inst_dict = _instructor_to_dict(inst)
        instructor_map[inst_dict["id"]] = inst_dict

    placeholder_ids = {
        iid for iid in instructor_map
        if iid.lower().strip() in PLACEHOLDER_INSTRUCTORS
    }
    if not placeholder_ids:
        return input_data

    new_sections = []
    new_instructors_by_id: Dict[str, dict] = {}
    counters: Dict[str, int] = {}

    for section in input_data.sections:
        section_dict = _section_to_dict(section)
        orig_id = section_dict.get("instructor_id")
        if orig_id not in placeholder_ids:
            new_sections.append(section_dict)
            continue

        counters[orig_id] = counters.get(orig_id, 0) + 1
        synthetic_id = f"{orig_id}__{counters[orig_id]}"
        section_dict = dict(section_dict)
        section_dict["instructor_id"] = synthetic_id
        new_sections.append(section_dict)

        if synthetic_id not in new_instructors_by_id:
            base = dict(instructor_map[orig_id])
            base["id"] = synthetic_id
            new_instructors_by_id[synthetic_id] = base

    new_instructors = [
        inst_dict for iid, inst_dict in instructor_map.items()
        if iid not in placeholder_ids
    ] + list(new_instructors_by_id.values())

    if not quiet:
        print(
            f"[preprocess] Split {len(placeholder_ids)} placeholder instructor(s) "
            f"into {len(new_instructors_by_id)} unique instructors",
            flush=True,
        )

    raw = {
        "courses": input_data.courses,
        "majors": input_data.majors,
        "major_preferences": input_data.major_preferences,
        "department_preferences": input_data.department_preferences,
        "section_preferences": input_data.section_preferences,
        "sections": new_sections,
        "instructors": new_instructors,
        "rooms": input_data.rooms,
        "timeslots": input_data.timeslots,
        "meeting_patterns": input_data.meeting_patterns,
        "crosslist_groups": input_data.crosslist_groups,
        "no_overlap_groups": input_data.no_overlap_groups,
        "blocked_times": input_data.blocked_times,
        "locked_assignments": input_data.locked_assignments,
        "soft_locks": input_data.soft_locks,
    }
    return SchedulingInput(raw)


def _solve_schedule(input_data: SchedulingInput):
    """Solve the schedule using CP-SAT.

    Args:
        input_data: Full scheduling input.

    Returns:
        Dict payload with status, solution or errors/diagnostics.
    """
    input_data = _split_placeholder_instructors(input_data)
    errors: List[dict] = []
    errors.extend(
        _validate_crosslist_capacity(
            input_data.crosslist_groups, input_data.sections, input_data.rooms
        )
    )
    options_by_section, option_errors = _build_options(input_data)
    errors.extend(option_errors)
    if errors:
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
    section_to_crosslist_group = _build_section_to_crosslist_group(
        input_data.crosslist_groups, input_data.sections
    )
    crosslist_roomshare = set()
    for group in input_data.crosslist_groups:
        group_dict = group.to_dict() if hasattr(group, "to_dict") else group
        group_id = group_dict.get("id") if isinstance(group_dict, dict) else group.id
        crosslist_roomshare.add(group_id)
    section_to_roomshare_group: Dict[str, str] = {}
    for section in input_data.sections:
        section_dict = _section_to_dict(section)
        section_id = section_dict["id"]
        crosslist_id = section_to_crosslist_group.get(section_id)
        if crosslist_id and crosslist_id in crosslist_roomshare:
            section_to_roomshare_group[section_id] = crosslist_id
        else:
            section_to_roomshare_group[section_id] = f"sec:{section_id}"

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

    # ------------------------------------------------------------------
    # Pre-index option_vars for O(1) lookups in constraint loops.
    # ------------------------------------------------------------------
    # (room_id, timeslot_id) -> [(section_id, idx, var)]
    vars_by_room_timeslot: Dict[Tuple[str, str], List[Tuple[str, int, cp_model.IntVar]]] = {}
    # (instructor_id, timeslot_id) -> [var]
    vars_by_instructor_timeslot: Dict[
        Tuple[str, str], List[Tuple[str, cp_model.IntVar]]
    ] = {}
    # (section_id, timeslot_id) -> [var]
    vars_by_section_timeslot: Dict[Tuple[str, str], List[cp_model.IntVar]] = {}

    for (section_id, idx), var in option_vars.items():
        _, timeslot_set, room_id, _ = option_data[(section_id, idx)]
        section_dict = _section_to_dict(sections_by_id[section_id])
        instructor_id = section_dict["instructor_id"]
        for ts_id in timeslot_set:
            vars_by_room_timeslot.setdefault((room_id, ts_id), []).append(
                (section_id, idx, var)
            )
            vars_by_instructor_timeslot.setdefault((instructor_id, ts_id), []).append(
                (section_id, var)
            )
            vars_by_section_timeslot.setdefault((section_id, ts_id), []).append(var)

    print(f"[solve] Indexed {len(option_vars)} option vars, building constraints...", flush=True)

    # Room usage: prevent overlaps across different roomshare groups.
    all_timeslot_ids = []
    for timeslot in input_data.timeslots:
        timeslot_dict = timeslot.to_dict() if hasattr(timeslot, "to_dict") else timeslot
        all_timeslot_ids.append(
            timeslot_dict.get("id") if isinstance(timeslot_dict, dict) else timeslot.id
        )

    # Build set of overlapping timeslot pairs for room and instructor constraints.
    overlapping_pairs = _build_overlapping_timeslot_pairs(input_data.timeslots)

    # Collect all (room, ts_a, ts_b) conflict sets — both same-timeslot and
    # cross-timeslot overlaps — then apply a single constraint per set.
    for room in input_data.rooms:
        room_id = (_room_to_dict(room))["id"]
        # Same-timeslot conflicts
        for timeslot_id in all_timeslot_ids:
            entries = vars_by_room_timeslot.get((room_id, timeslot_id))
            if not entries:
                continue
            vars_by_group: Dict[str, List[cp_model.IntVar]] = {}
            for section_id, idx, var in entries:
                group_key = section_to_roomshare_group[section_id]
                vars_by_group.setdefault(group_key, []).append(var)
            if len(vars_by_group) > 1:
                group_used_vars = []
                for group_key, vars_for_group in vars_by_group.items():
                    group_used = model.NewBoolVar(f"room_use_{room_id}_{timeslot_id}_{group_key}")
                    for var in vars_for_group:
                        model.Add(group_used >= var)
                    group_used_vars.append(group_used)
                model.Add(sum(group_used_vars) <= 1)

        # Cross-timeslot overlap conflicts: for pairs of timeslots that overlap
        # in time, no two different roomshare groups can use the same room.
        for ts_a, ts_b in overlapping_pairs:
            entries_a = vars_by_room_timeslot.get((room_id, ts_a))
            entries_b = vars_by_room_timeslot.get((room_id, ts_b))
            if not entries_a or not entries_b:
                continue
            # Merge entries from both timeslots, grouped by roomshare group
            vars_by_group_cross: Dict[str, List[cp_model.IntVar]] = {}
            for section_id, idx, var in entries_a:
                group_key = section_to_roomshare_group[section_id]
                vars_by_group_cross.setdefault(group_key, []).append(var)
            for section_id, idx, var in entries_b:
                group_key = section_to_roomshare_group[section_id]
                vars_by_group_cross.setdefault(group_key, []).append(var)
            if len(vars_by_group_cross) > 1:
                group_used_vars = []
                for group_key, vars_for_group in vars_by_group_cross.items():
                    group_used = model.NewBoolVar(
                        f"room_overlap_{room_id}_{ts_a}_{ts_b}_{group_key}"
                    )
                    for var in vars_for_group:
                        model.Add(group_used >= var)
                    group_used_vars.append(group_used)
                model.Add(sum(group_used_vars) <= 1)

    print("[solve] Room constraints done.", flush=True)

    # Instructor cannot teach overlapping times (same timeslot OR overlapping timeslots).
    for instructor in input_data.instructors:
        instructor_id = (_instructor_to_dict(instructor))["id"]
        for timeslot_id in all_timeslot_ids:
            entries_for_slot = vars_by_instructor_timeslot.get((instructor_id, timeslot_id))
            if entries_for_slot and len(entries_for_slot) > 1:
                vars_by_group: Dict[str, List[cp_model.IntVar]] = {}
                for section_id, var in entries_for_slot:
                    group_key = section_to_crosslist_group.get(section_id, f"sec:{section_id}")
                    vars_by_group.setdefault(group_key, []).append(var)
                if len(vars_by_group) > 1:
                    group_used_vars = []
                    for group_key, vars_for_group in vars_by_group.items():
                        group_used = model.NewBoolVar(
                            f"inst_use_{instructor_id}_{timeslot_id}_{group_key}"
                        )
                        for var in vars_for_group:
                            model.Add(group_used >= var)
                        group_used_vars.append(group_used)
                    model.Add(sum(group_used_vars) <= 1)
        # Cross-timeslot overlaps for instructors too
        for ts_a, ts_b in overlapping_pairs:
            entries_a = vars_by_instructor_timeslot.get((instructor_id, ts_a), [])
            entries_b = vars_by_instructor_timeslot.get((instructor_id, ts_b), [])
            if entries_a and entries_b:
                vars_by_group_cross: Dict[str, List[cp_model.IntVar]] = {}
                for section_id, var in entries_a + entries_b:
                    group_key = section_to_crosslist_group.get(section_id, f"sec:{section_id}")
                    vars_by_group_cross.setdefault(group_key, []).append(var)
                if len(vars_by_group_cross) > 1:
                    group_used_vars = []
                    for group_key, vars_for_group in vars_by_group_cross.items():
                        group_used = model.NewBoolVar(
                            f"inst_overlap_{instructor_id}_{ts_a}_{ts_b}_{group_key}"
                        )
                        for var in vars_for_group:
                            model.Add(group_used >= var)
                        group_used_vars.append(group_used)
                    model.Add(sum(group_used_vars) <= 1)

    print("[solve] Instructor constraints done.", flush=True)

    # No-overlap groups cannot overlap in time.
    for group in input_data.no_overlap_groups:
        group_dict = group.to_dict() if hasattr(group, "to_dict") else group
        member_ids = group_dict.get("member_section_ids", []) if isinstance(group_dict, dict) else group.member_section_ids
        for timeslot_id in all_timeslot_ids:
            vars_for_slot = []
            for section_id in member_ids:
                slot_vars = vars_by_section_timeslot.get((section_id, timeslot_id))
                if slot_vars:
                    vars_for_slot.extend(slot_vars)
            if len(vars_for_slot) > 1:
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
            pair: Tuple[str, str] = (min(section_id, other_id), max(section_id, other_id))
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

        for timeslot_id in all_timeslot_ids:
            vars_for_slot: List[cp_model.IntVar] = []
            for section_id in core_section_ids:
                slot_vars = vars_by_section_timeslot.get((section_id, timeslot_id))
                if slot_vars:
                    vars_for_slot.extend(slot_vars)
            if len(vars_for_slot) > 1:
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
            course = courses_by_id.get(course_id) if course_id else None
            if course and course.get("department") == department_name:
                sid = s_dict.get("id")
                if sid is not None:
                    dept_section_ids.append(sid)

        if len(dept_section_ids) < 2:
            continue

        # For each timeslot, enforce: at most one section from this department.
        for timeslot_id in all_timeslot_ids:
            vars_for_slot: List[cp_model.IntVar] = []
            for section_id in dept_section_ids:
                slot_vars = vars_by_section_timeslot.get((section_id, timeslot_id))
                if slot_vars:
                    vars_for_slot.extend(slot_vars)

            if len(vars_for_slot) > 1:
                model.Add(sum(vars_for_slot) <= 1)

    print("[solve] Major/department/no-overlap constraints done.", flush=True)

    # Cross-listed sections share both times and room.
    for group in input_data.crosslist_groups:
        group_dict = group.to_dict() if hasattr(group, "to_dict") else group
        members = group_dict.get("member_section_ids", []) if isinstance(group_dict, dict) else group.member_section_ids
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
                        elif room_a != room_b:
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
                weight = (soft_lock.get("weight") if isinstance(soft_lock, dict) else getattr(soft_lock, "weight", 1.0)) or 1.0
                soft_penalty += weight * SOFT_LOCK_BASE_WEIGHT
        # Penalize if room doesn't match preference
        preferred_room = soft_lock.get("preferred_room") if isinstance(soft_lock, dict) else getattr(soft_lock, "preferred_room", None)
        if preferred_room:
            if room_id != preferred_room:
                weight = (soft_lock.get("weight") if isinstance(soft_lock, dict) else getattr(soft_lock, "weight", 1.0)) or 1.0
                soft_penalty += weight * SOFT_LOCK_BASE_WEIGHT
        if soft_penalty > 0:
            penalty_terms.append(var * int(soft_penalty))

    # Minimize total penalty.
    model.Minimize(sum(penalty_terms))

    print("[solve] Model built, starting CP-SAT solver...", flush=True)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 120.0
    solver.parameters.num_workers = 2
    solver.parameters.random_seed = 0
    status = solver.Solve(model)
    print(f"[solve] Solver finished, status={solver.StatusName(status)}", flush=True)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        base_diag = {
            **_build_run_diagnostics(input_data, options_by_section),
            "cp_sat_status": solver.StatusName(status),
        }
        # UNKNOWN usually means the time limit was hit before a feasible solution
        # was found — not a proof of infeasibility. Running _diagnose_infeasibility
        # in that case suggests removing many instructors even when the instance
        # is solvable with more search time or a looser model.
        if status == cp_model.INFEASIBLE:
            diagnostics = {**_diagnose_infeasibility(input_data), **base_diag}
            err_code, err_msg = "infeasible", "No feasible schedule exists under the current constraints."
        elif status == cp_model.UNKNOWN:
            diagnostics = base_diag
            err_code, err_msg = (
                "solver_timeout",
                (
                    "The solver stopped before finding a schedule (often the time limit). "
                    "Tighter room sets make this more likely; try increasing the solver time "
                    "or relaxing constraints — the problem may still be feasible."
                ),
            )
        else:
            diagnostics = base_diag
            err_code, err_msg = (
                "solver_failed",
                f"Solver finished with status {solver.StatusName(status)}.",
            )
        return {
            "status": "error",
            "errors": [{"code": err_code, "message": err_msg}],
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
        section_prefs = section_prefs_by_id.get(section_id, {})
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
                    weight = (soft_lock.get("weight") if isinstance(soft_lock, dict) else getattr(soft_lock, "weight", 1.0)) or 1.0
                    penalty_breakdown["soft_lock_time"] += float(
                        weight * SOFT_LOCK_BASE_WEIGHT
                    )
            preferred_room = soft_lock.get("preferred_room") if isinstance(soft_lock, dict) else getattr(soft_lock, "preferred_room", None)
            if preferred_room:
                if room_id != preferred_room:
                    weight = (soft_lock.get("weight") if isinstance(soft_lock, dict) else getattr(soft_lock, "weight", 1.0)) or 1.0
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


@app.route("/data", methods=["GET"])
def get_data():
    """Return all scheduling data from the database in SchedulingInput shape."""
    try:
        sections = [
            {
                **s.to_dict(),
                "previous_meeting_pattern": None,
            }
            for s in Section.query.all()
        ]

        instructors = []
        for inst in Instructor.query.all():
            d = inst.to_dict()
            prefs = d.pop("preferences", {}) or {}
            instructors.append({
                "id": d["id"],
                "name": d["name"],
                "rank_type": d["rank_type"],
                "unavailable_times": prefs.get("unavailable_times", []),
                "preferences": {
                    "preferred_days": prefs.get("preferred_days", []),
                    "preferred_patterns": prefs.get("preferred_patterns", []),
                    "max_teaching_days": prefs.get("max_teaching_days"),
                },
            })

        rooms = [
            {
                "id": r.id,
                "building": r.building,
                "room_number": r.room_number,
                "capacity": r.capacity,
                "features": r.features or [],
            }
            for r in Room.query.all()
        ]

        timeslots = [
            {
                "id": t.id,
                "day": t.days,
                "start_time": t.to_dict()["start_time"],
                "end_time": t.to_dict()["end_time"],
                "slot_type": t.slot_type,
            }
            for t in Timeslot.query.all()
        ]

        meeting_patterns = [mp.to_dict() for mp in MeetingPattern.query.all()]
        crosslist_groups = [cg.to_dict() for cg in CrossListGroup.query.all()]
        no_overlap_groups = [nog.to_dict() for nog in NoOverlapGroup.query.all()]
        blocked_times = [bt.to_dict() for bt in BlockedTime.query.all()]
        locked_assignments = [la.to_dict() for la in LockedAssignment.query.all()]
        soft_locks = [sl.to_dict() for sl in SoftLock.query.all()]

        return jsonify({
            "status": "ok",
            "data": {
                "sections": sections,
                "instructors": instructors,
                "rooms": rooms,
                "timeslots": timeslots,
                "meeting_patterns": meeting_patterns,
                "crosslist_groups": crosslist_groups,
                "no_overlap_groups": no_overlap_groups,
                "blocked_times": blocked_times,
                "locked_assignments": locked_assignments,
                "soft_locks": soft_locks,
            },
        })
    except Exception as exc:
        return (
            jsonify({
                "status": "error",
                "errors": [{
                    "code": "read_failed",
                    "message": f"Failed to read scheduling data: {exc}",
                }],
            }),
            500,
        )


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
        parsed = build_parsed_data_from_excel(file_bytes)
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

    print("[solve] Starting solve request...", flush=True)
    input_data = SchedulingInput(data["input"])

    remove_instructors = data.get("remove_instructors")
    if remove_instructors:
        print(f"[solve] Removing {len(remove_instructors)} instructor(s): {remove_instructors}", flush=True)
        for inst_id in remove_instructors:
            input_data = _strip_instructor(input_data, inst_id)

    try:
        result = _solve_schedule(input_data)
    except Exception as exc:
        import traceback
        traceback.print_exc()
        result = {
            "status": "error",
            "errors": [
                {
                    "code": "internal_error",
                    "message": f"Solver crashed: {type(exc).__name__}: {exc}",
                }
            ],
        }
    print(f"[solve] Solve completed with status: {result.get('status', 'unknown')}", flush=True)
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
        # Clear dependent rows first (FK order matters on Postgres)
        ScheduleAssignment.query.filter(ScheduleAssignment.section_id.isnot(None)).delete()
        SoftLock.query.delete()
        LockedAssignment.query.delete()
        SectionPreferences.query.delete()
        Section.query.delete()

        # Auto-create referenced Course / Instructor rows that don't exist yet.
        existing_course_ids = {c.id for c in db.session.query(Course.id).all()}  # type: ignore[attr-defined]
        existing_instructor_ids = {i.id for i in db.session.query(Instructor.id).all()}  # type: ignore[attr-defined]

        for item in sections_payload:
            cid = item.get("course_id")
            if cid and cid not in existing_course_ids:
                dept = (str(item.get("department") or "").strip()) or ""
                db.session.add(Course(
                    id=cid,
                    title=cid,
                    department=dept,
                ))
                existing_course_ids.add(cid)

            iid = item.get("instructor_id")
            if iid and iid not in existing_instructor_ids:
                db.session.add(Instructor(
                    id=iid,
                    name=iid,
                    rank_type="Unknown",
                ))
                existing_instructor_ids.add(iid)

        db.session.flush()

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
        InstructorPreferences.query.delete()
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
        RoomPreferences.query.delete()
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
        crosslist_cols = {
            col["name"] for col in inspect(db.engine).get_columns("crosslist_groups")
        }
        has_legacy_room_col = "require_same_room" in crosslist_cols
        CrossListGroup.query.delete()
        NoOverlapGroup.query.delete()
        BlockedTime.query.delete()
        LockedAssignment.query.delete()
        SoftLock.query.delete()

        for item in data.get("crosslist_groups", []) or []:
            if has_legacy_room_col:
                db.session.execute(
                    text(
                        """
                        INSERT INTO crosslist_groups (id, member_section_ids, require_same_room)
                        VALUES (:id, :member_section_ids, 1)
                        """
                    ),
                    {
                        "id": item.get("id"),
                        "member_section_ids": json.dumps(
                            item.get("member_section_ids", []) or []
                        ),
                    },
                )
            else:
                db.session.add(
                    CrossListGroup(
                        id=item.get("id"),
                        member_section_ids=item.get("member_section_ids", []) or [],
                    )
                )
        # Canonicalize section-level cross-list IDs from group membership.
        # Cross-list groups are the source of truth.
        Section.query.update({Section.crosslist_group_id: None})
        for item in data.get("crosslist_groups", []) or []:
            group_id = item.get("id")
            member_ids = item.get("member_section_ids", []) or []
            if not group_id or not member_ids:
                continue
            (
                Section.query.filter(Section.id.in_(member_ids))
                .update({Section.crosslist_group_id: group_id}, synchronize_session=False)
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
                    days=item.get("days"),
                    start_time=item.get("start_time"),
                    end_time=item.get("end_time"),
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
    _ensure_schema_migrations()
    _seed_if_empty()


if __name__ == "__main__":
    # Run the Flask app
    app.run(debug=True, host="0.0.0.0", port=5001)

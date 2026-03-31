from __future__ import annotations

from dataclasses import dataclass
from datetime import time
from typing import Any, Dict, Iterable, List, Tuple

import pandas as pd

from model import Course, Instructor, Room, Timeslot, MeetingPattern, Section, db


def _parse_time(value: Any) -> time:
    """
    Normalize a time-like Excel cell into a Python time.

    Accepts:
    - Excel time (already datetime.time)
    - pandas Timestamp / datetime-like
    - string values like '8:15', '08:15', '8:15 AM'
    """
    if isinstance(value, time):
        return value
    if pd.isna(value):
        raise ValueError("Missing required time value")
    # pandas may give Timestamps for Excel times
    if hasattr(value, "to_pydatetime"):
        return value.to_pydatetime().time()
    if hasattr(value, "time"):
        return value.time()
    if isinstance(value, (int, float)):
        # Excel stores times as fraction of a day; let pandas handle
        return pd.to_datetime(value, unit="D", origin="1899-12-30").time()
    # Fallback: parse from string
    s = str(value).strip()
    # Try several common formats
    for fmt in ("%H:%M", "%I:%M %p", "%H:%M:%S"):
        try:
            return pd.to_datetime(s, format=fmt).time()  # type: ignore[arg-type]
        except ValueError:
            continue
    # Let pandas infer as last resort
    return pd.to_datetime(s).time()  # type: ignore[arg-type]


def _make_timeslot_id(days: str, start: time, end: time, slot_type: str) -> str:
    return f"{slot_type}:{days}:{start.strftime('%H%M')}-{end.strftime('%H%M')}"


@dataclass
class ParsedData:
    courses: List[Dict[str, Any]]
    instructors: List[Dict[str, Any]]
    rooms: List[Dict[str, Any]]
    timeslots: List[Dict[str, Any]]
    meeting_patterns: List[Dict[str, Any]]
    sections: List[Dict[str, Any]]

    def to_scheduling_input(self) -> Dict[str, Any]:
        """
        Return a dict compatible with SchedulingInput / /solve payload.
        """
        return {
            "sections": self.sections,
            "instructors": self.instructors,
            "rooms": self.rooms,
            "timeslots": self.timeslots,
            "meeting_patterns": self.meeting_patterns,
            # The following are optional in the Excel import for now.
            "crosslist_groups": [],
            "no_overlap_groups": [],
            "blocked_times": [],
            "locked_assignments": [],
            "soft_locks": [],
        }


def _lecture_timeslot_grid() -> List[Dict[str, Any]]:
    """
    Canonical lecture/standard timeslots derived from the provided grid image.

    Days use 'MWF' or 'TR'; slot_type is 'standard' or 'evening'.
    """
    # Core daytime grid
    specs: List[Tuple[str, str, str, str]] = [
        ("MWF", "08:15", "09:05", "standard"),
        ("TR", "08:30", "09:45", "standard"),
        ("MWF", "08:55", "10:10", "standard"),
        ("MWF", "09:20", "10:10", "standard"),
        ("TR", "10:00", "11:15", "standard"),
        ("MWF", "10:25", "11:15", "standard"),
        ("MWF", "11:30", "12:20", "standard"),
        ("TR", "11:30", "12:45", "standard"),
        ("MWF", "12:35", "13:50", "standard"),
        ("TR", "13:00", "14:15", "standard"),
        ("MWF", "14:05", "14:55", "standard"),
        ("TR", "14:45", "16:00", "standard"),
        ("MWF", "15:10", "16:00", "standard"),
        ("TR", "15:10", "16:25", "standard"),
        ("TR", "16:15", "17:30", "standard"),
        ("MWF", "16:40", "17:30", "standard"),
        # Evening / extended slots (exactly as shown or approximated)
        ("TR", "18:00", "19:15", "evening"),
        ("MWF", "18:25", "19:40", "evening"),
        ("M", "18:00", "20:30", "evening"),
        ("W", "18:00", "20:30", "evening"),
        ("T", "18:25", "20:55", "evening"),
        ("R", "18:25", "20:55", "evening"),
        ("M", "19:30", "20:45", "evening"),
    ]

    timeslots: List[Dict[str, Any]] = []
    for days, start_str, end_str, slot_type in specs:
        start = _parse_time(start_str)
        end = _parse_time(end_str)
        slot_id = _make_timeslot_id(days, start, end, slot_type)
        timeslots.append(
            {
                "id": slot_id,
                "days": days,
                "start_time": start,
                "end_time": end,
                "slot_type": slot_type,
            }
        )
    return timeslots


def _lab_timeslot_grid() -> List[Dict[str, Any]]:
    """
    Canonical lab timeslots from the Fall/Spring lab grid image.

    Labs are single-day blocks (M/T/W/R/F) with slot_type 'lab'.
    """
    specs: List[Tuple[str, str, str]] = [
        # Morning labs
        ("M", "08:15", "11:15"),
        ("T", "08:15", "11:15"),
        ("W", "08:15", "11:15"),
        ("R", "08:15", "11:15"),
        ("F", "08:15", "11:15"),
        # Midday labs (respecting Community Hour on Friday)
        ("M", "11:45", "14:45"),
        ("T", "11:30", "14:30"),
        ("W", "11:45", "14:45"),
        ("R", "11:30", "14:30"),
        # No Friday midday lab because of Community Hour
        # Afternoon labs
        ("M", "15:10", "18:10"),
        ("T", "14:45", "17:45"),
        ("W", "15:10", "18:10"),
        ("R", "14:45", "17:45"),
        ("F", "15:10", "18:10"),
        # Evening labs
        ("M", "18:30", "21:30"),
        ("T", "18:00", "21:00"),
        ("W", "18:30", "21:30"),
        ("R", "18:00", "21:00"),
        ("F", "18:30", "21:30"),
    ]

    timeslots: List[Dict[str, Any]] = []
    for day, start_str, end_str in specs:
        start = _parse_time(start_str)
        end = _parse_time(end_str)
        slot_type = "lab"
        slot_id = _make_timeslot_id(day, start, end, slot_type)
        timeslots.append(
            {
                "id": slot_id,
                "days": day,
                "start_time": start,
                "end_time": end,
                "slot_type": slot_type,
            }
        )
    return timeslots


def default_timeslots() -> List[Dict[str, Any]]:
    """
    Combined default timeslot grid (lecture + lab).

    This is useful when the Excel file does not explicitly define timeslots
    and we want to seed the database from the institutional grid.
    """
    # Merge and de-duplicate by ID
    all_slots: Dict[str, Dict[str, Any]] = {}
    for slot in _lecture_timeslot_grid() + _lab_timeslot_grid():
        all_slots[slot["id"]] = slot
    return list(all_slots.values())


def parse_excel_to_dicts(excel_bytes: bytes) -> ParsedData:
    """
    Parse an uploaded Excel file into plain dict records aligned with the data model.

    Expected sheet names (case-insensitive):
    - Courses
    - Instructors
    - Rooms
    - Sections
    - Timeslots (optional; if omitted, default grid is used)
    - MeetingPatterns (optional)

    Columns should match the model fields; extra columns are ignored.
    """
    from io import BytesIO
    
    # Wrap bytes in a file-like object for pandas
    excel_file = BytesIO(excel_bytes)
    xls = pd.ExcelFile(excel_file)
    sheets = {name.lower(): name for name in xls.sheet_names}

    def read_sheet(key: str) -> pd.DataFrame:
        name = sheets.get(key.lower())
        if not name:
            return pd.DataFrame()
        return xls.parse(name)

    courses_df = read_sheet("courses")
    instructors_df = read_sheet("instructors")
    rooms_df = read_sheet("rooms")
    sections_df = read_sheet("sections")
    timeslots_df = read_sheet("timeslots")
    meeting_patterns_df = read_sheet("meetingpatterns")

    courses: List[Dict[str, Any]] = []
    if not courses_df.empty:
        for _, row in courses_df.iterrows():
            courses.append(
                {
                    "id": str(row["id"]),
                    "title": str(row["title"]),
                    "department": str(row["department"]),
                    "is_core": bool(row.get("is_core", False)),
                    "is_new": bool(row.get("is_new", False)),
                }
            )

    instructors: List[Dict[str, Any]] = []
    if not instructors_df.empty:
        for _, row in instructors_df.iterrows():
            preferences = {
                "preferred_days": _split_cell(row.get("preferred_days")),
                "preferred_patterns": _split_cell(row.get("preferred_patterns")),
                "max_teaching_days": _maybe_int(row.get("max_teaching_days")),
            }
            instructors.append(
                {
                    "id": str(row["id"]),
                    "name": str(row.get("name", "")),
                    "rank_type": str(row.get("rank_type", "")),
                    "unavailable_times": _split_cell(row.get("unavailable_times")),
                    "preferences": preferences,
                }
            )

    rooms: List[Dict[str, Any]] = []
    if not rooms_df.empty:
        for _, row in rooms_df.iterrows():
            rooms.append(
                {
                    "id": str(row["id"]),
                    "building": str(row["building"]),
                    "room_number": str(row.get("room_number", "")),
                    "capacity": int(row["capacity"]),
                    "room_type": str(row.get("room_type", "lecture")),
                    "has_av": bool(row.get("has_av", False)),
                    "is_accessible": bool(row.get("is_accessible", True)),
                    "features": _split_cell(row.get("features")),
                }
            )

    # Timeslots: if sheet provided, parse/validate; otherwise seed from default grid.
    timeslots: List[Dict[str, Any]] = []
    if not timeslots_df.empty:
        for _, row in timeslots_df.iterrows():
            days = str(row["days"]).strip()
            slot_type = str(row.get("slot_type", "standard")).strip()
            start = _parse_time(row["start_time"])
            end = _parse_time(row["end_time"])
            slot_id = str(row.get("id")) if not pd.isna(row.get("id")) else _make_timeslot_id(
                days, start, end, slot_type
            )
            timeslots.append(
                {
                    "id": slot_id,
                    "days": days,
                    "start_time": start,
                    "end_time": end,
                    "slot_type": slot_type,
                }
            )
    else:
        timeslots = default_timeslots()

    meeting_patterns: List[Dict[str, Any]] = []
    if not meeting_patterns_df.empty:
        for _, row in meeting_patterns_df.iterrows():
            meeting_patterns.append(
                {
                    "id": str(row["id"]),
                    "slots_required": int(row["slots_required"]),
                    "allowed_days": _split_cell(row.get("allowed_days")),
                    "compatible_timeslot_sets": _parse_timeslot_sets(
                        row.get("compatible_timeslot_sets")
                    ),
                }
            )

    sections: List[Dict[str, Any]] = []
    if not sections_df.empty:
        for _, row in sections_df.iterrows():
            sections.append(
                {
                    "id": str(row["id"]),
                    "course_id": str(row["course_id"]),
                    "section_code": str(row["section_code"]),
                    "instructor_id": str(row["instructor_id"]),
                    "room_id": row.get("room_id") if not pd.isna(row.get("room_id")) else None,
                    "timeslot_id": row.get("timeslot_id")
                    if not pd.isna(row.get("timeslot_id"))
                    else None,
                    "crosslisting_id": row.get("crosslisting_id")
                    if not pd.isna(row.get("crosslisting_id"))
                    else None,
                    "crosslist_group_id": row.get("crosslist_group_id")
                    if not pd.isna(row.get("crosslist_group_id"))
                    else None,
                    "section_type": str(row.get("section_type", "lecture")),
                    "expected_enrollment": int(row["expected_enrollment"]),
                    "enrollment_cap": int(row.get("enrollment_cap", row["expected_enrollment"])),
                    "is_crosslisted": bool(row.get("is_crosslisted", False)),
                    "last_year_time": row.get("last_year_time")
                    if not pd.isna(row.get("last_year_time"))
                    else None,
                    "last_year_room": row.get("last_year_room")
                    if not pd.isna(row.get("last_year_room"))
                    else None,
                    "allowed_meeting_patterns": _split_cell(
                        row.get("allowed_meeting_patterns")
                    ),
                    "room_requirements": _split_cell(row.get("room_requirements")),
                    "tags": _split_cell(row.get("tags")),
                }
            )

    return ParsedData(
        courses=courses,
        instructors=instructors,
        rooms=rooms,
        timeslots=timeslots,
        meeting_patterns=meeting_patterns,
        sections=sections,
    )


def _split_cell(value: Any) -> List[str]:
    """
    Split a semi-colon or comma separated cell into a list of strings.
    """
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value]
    s = str(value).strip()
    if not s:
        return []
    # Support both comma and semicolon separators.
    parts: Iterable[str] = []
    if ";" in s:
        parts = s.split(";")
    elif "," in s:
        parts = s.split(",")
    else:
        parts = [s]
    return [p.strip() for p in parts if p.strip()]


def _maybe_int(value: Any) -> int | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_timeslot_sets(value: Any) -> List[List[str]]:
    """
    Parse a cell into a list of timeslot-id lists (same rules as spreadsheet_io).

    Accepts list-of-lists, a flat list (one set), or text:
    "slot1|slot2; slot3|slot4" — ';' separates alternatives, '|' or ',' IDs within a set.
    """
    try:
        from spreadsheet_io.spreadsheet_utils import parse_nested_list_cell
    except ModuleNotFoundError:
        from spreadsheet_utils import parse_nested_list_cell  # type: ignore[no-redef]

    return parse_nested_list_cell(value)


def persist_parsed_data(parsed: ParsedData) -> None:
    """
    Upsert parsed records into the SQLAlchemy models.

    This uses db.session.merge() so existing IDs are updated, new ones inserted.
    """
    for course in parsed.courses:
        db.session.merge(Course(**course))
    for inst in parsed.instructors:
        db.session.merge(Instructor(id=inst["id"], name=inst.get("name", ""), rank_type=inst["rank_type"]))
        # Preferences mapping into InstructorPreferences is left to a future layer.
    for room in parsed.rooms:
        db.session.merge(Room(**room))
    for slot in parsed.timeslots:
        db.session.merge(
            Timeslot(
                id=slot["id"],
                days=slot["days"],
                start_time=slot["start_time"],
                end_time=slot["end_time"],
                slot_type=slot["slot_type"],
            )
        )
    for mp in parsed.meeting_patterns:
        db.session.merge(
            MeetingPattern(
                id=mp["id"],
                slots_required=mp["slots_required"],
                allowed_days=mp["allowed_days"],
                compatible_timeslot_sets=mp["compatible_timeslot_sets"],
            )
        )
    for sec in parsed.sections:
        db.session.merge(Section(**sec))
    db.session.commit()


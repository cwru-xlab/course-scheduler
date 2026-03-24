from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Any, Dict, List

from openpyxl import Workbook
from openpyxl.worksheet.worksheet import Worksheet

LIST_SEPARATOR = ";"
SET_SEPARATOR = "|"


@dataclass(frozen=True)
class SheetSpec:
    name: str
    columns: List[str]


SPREADSHEET_SPECS: List[SheetSpec] = [
    SheetSpec(
        name="Sections",
        columns=[
            "id",
            "course_id",
            "section_code",
            "instructor_id",
            "expected_enrollment",
            "enrollment_cap",
            "allowed_meeting_patterns",
            "room_requirements",
            "crosslist_group_id",
            "tags",
        ],
    ),
    SheetSpec(
        name="Instructors",
        columns=[
            "id",
            "rank_type",
            "unavailable_times",
            "preferred_days",
            "preferred_patterns",
            "max_teaching_days",
        ],
    ),
    SheetSpec(
        name="Rooms",
        columns=["id", "building", "capacity", "features"],
    ),
    SheetSpec(
        name="Timeslots",
        columns=["id", "day", "start_time", "end_time"],
    ),
    SheetSpec(
        name="MeetingPatterns",
        columns=["id", "slots_required", "allowed_days", "compatible_timeslot_sets"],
    ),
    SheetSpec(
        name="CrosslistGroups",
        columns=["id", "member_section_ids", "require_same_room"],
    ),
    SheetSpec(
        name="NoOverlapGroups",
        columns=["id", "member_section_ids", "reason"],
    ),
    SheetSpec(
        name="BlockedTimes",
        columns=["scope", "timeslot_ids", "reason"],
    ),
    SheetSpec(
        name="LockedAssignments",
        columns=["section_id", "fixed_timeslot_set", "fixed_room"],
    ),
    SheetSpec(
        name="SoftLocks",
        columns=["section_id", "preferred_timeslot_set", "preferred_room", "weight"],
    ),
]

SHEET_NAME_TO_SPEC: Dict[str, SheetSpec] = {spec.name: spec for spec in SPREADSHEET_SPECS}


def parse_list_cell(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    text = str(value).strip()
    if not text:
        return []
    return [part.strip() for part in text.split(LIST_SEPARATOR) if part.strip()]


def serialize_list_cell(values: List[str] | None) -> str:
    if not values:
        return ""
    return LIST_SEPARATOR.join(str(v).strip() for v in values if str(v).strip())


def parse_nested_list_cell(value: Any) -> List[List[str]]:
    if value is None:
        return []
    text = str(value).strip()
    if not text:
        return []
    sets: List[List[str]] = []
    for set_part in text.split(LIST_SEPARATOR):
        set_part = set_part.strip()
        if not set_part:
            continue
        entries = [part.strip() for part in set_part.split(SET_SEPARATOR) if part.strip()]
        if entries:
            sets.append(entries)
    return sets


def serialize_nested_list_cell(values: List[List[str]] | None) -> str:
    if not values:
        return ""
    set_strings = []
    for row in values:
        entries = [str(v).strip() for v in row if str(v).strip()]
        if entries:
            set_strings.append(SET_SEPARATOR.join(entries))
    return LIST_SEPARATOR.join(set_strings)


def parse_bool_cell(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y"}:
        return True
    if text in {"0", "false", "no", "n"}:
        return False
    return default


def maybe_int(value: Any) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except (TypeError, ValueError):
        return None


def maybe_float(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def maybe_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def build_template_workbook() -> Workbook:
    wb = Workbook()
    default_ws = wb.active
    wb.remove(default_ws)

    for spec in SPREADSHEET_SPECS:
        ws = wb.create_sheet(spec.name)
        ws.append(spec.columns)
        _autosize_columns(ws, spec.columns)
    return wb


def build_template_bytes() -> bytes:
    wb = build_template_workbook()
    output = BytesIO()
    wb.save(output)
    return output.getvalue()


def _autosize_columns(ws: Worksheet, headers: List[str]) -> None:
    for idx, header in enumerate(headers, start=1):
        ws.column_dimensions[chr(64 + idx)].width = max(len(header) + 2, 14)

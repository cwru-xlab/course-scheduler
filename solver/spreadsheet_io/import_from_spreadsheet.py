from __future__ import annotations

from io import BytesIO
from typing import Any, Dict, List

from openpyxl import load_workbook

try:
    from spreadsheet_io.spreadsheet_utils import (
        SHEET_NAME_TO_SPEC,
        maybe_float,
        maybe_int,
        maybe_str,
        parse_bool_cell,
        parse_list_cell,
        parse_nested_list_cell,
    )
except ModuleNotFoundError:
    from spreadsheet_utils import (  # type: ignore[no-redef]
        SHEET_NAME_TO_SPEC,
        maybe_float,
        maybe_int,
        maybe_str,
        parse_bool_cell,
        parse_list_cell,
        parse_nested_list_cell,
    )


def parse_scheduling_input_from_excel_bytes(excel_bytes: bytes) -> Dict[str, Any]:
    wb = load_workbook(BytesIO(excel_bytes), data_only=True)

    sections_rows = _read_rows(wb, "Sections")
    instructors_rows = _read_rows(wb, "Instructors")
    rooms_rows = _read_rows(wb, "Rooms")
    timeslots_rows = _read_rows(wb, "Timeslots")
    meeting_patterns_rows = _read_rows(wb, "MeetingPatterns")
    crosslist_rows = _read_rows(wb, "CrosslistGroups")
    no_overlap_rows = _read_rows(wb, "NoOverlapGroups")
    blocked_rows = _read_rows(wb, "BlockedTimes")
    locked_rows = _read_rows(wb, "LockedAssignments")
    soft_rows = _read_rows(wb, "SoftLocks")

    sections: List[Dict[str, Any]] = []
    for row in sections_rows:
        section_id = _required_str(row, "id", "Sections")
        sections.append(
            {
                "id": section_id,
                "course_id": _required_str(row, "course_id", "Sections"),
                "section_code": _required_str(row, "section_code", "Sections"),
                "instructor_id": _required_str(row, "instructor_id", "Sections"),
                "expected_enrollment": _required_int(row, "expected_enrollment", "Sections"),
                "enrollment_cap": _required_int(row, "enrollment_cap", "Sections"),
                "allowed_meeting_patterns": parse_list_cell(row.get("allowed_meeting_patterns")),
                "room_requirements": parse_list_cell(row.get("room_requirements")),
                "crosslist_group_id": maybe_str(row.get("crosslist_group_id")),
                "tags": parse_list_cell(row.get("tags")),
            }
        )

    instructors: List[Dict[str, Any]] = []
    for row in instructors_rows:
        instructor_id = _required_str(row, "id", "Instructors")
        instructors.append(
            {
                "id": instructor_id,
                "rank_type": _required_str(row, "rank_type", "Instructors"),
                "unavailable_times": parse_list_cell(row.get("unavailable_times")),
                "preferences": {
                    "preferred_days": parse_list_cell(row.get("preferred_days")),
                    "preferred_patterns": parse_list_cell(row.get("preferred_patterns")),
                    "max_teaching_days": maybe_int(row.get("max_teaching_days")),
                },
            }
        )

    rooms: List[Dict[str, Any]] = []
    for row in rooms_rows:
        room_id = _required_str(row, "id", "Rooms")
        rooms.append(
            {
                "id": room_id,
                "building": _required_str(row, "building", "Rooms"),
                "capacity": _required_int(row, "capacity", "Rooms"),
                "features": parse_list_cell(row.get("features")),
            }
        )

    timeslots: List[Dict[str, Any]] = []
    for row in timeslots_rows:
        slot_id = _required_str(row, "id", "Timeslots")
        timeslots.append(
            {
                "id": slot_id,
                "day": _required_str(row, "day", "Timeslots"),
                "start_time": _required_str(row, "start_time", "Timeslots"),
                "end_time": _required_str(row, "end_time", "Timeslots"),
            }
        )

    meeting_patterns: List[Dict[str, Any]] = []
    for row in meeting_patterns_rows:
        pattern_id = _required_str(row, "id", "MeetingPatterns")
        meeting_patterns.append(
            {
                "id": pattern_id,
                "slots_required": _required_int(row, "slots_required", "MeetingPatterns"),
                "allowed_days": parse_list_cell(row.get("allowed_days")),
                "compatible_timeslot_sets": parse_nested_list_cell(
                    row.get("compatible_timeslot_sets")
                ),
            }
        )

    crosslist_groups: List[Dict[str, Any]] = []
    for row in crosslist_rows:
        crosslist_groups.append(
            {
                "id": _required_str(row, "id", "CrosslistGroups"),
                "member_section_ids": parse_list_cell(row.get("member_section_ids")),
                "require_same_room": parse_bool_cell(row.get("require_same_room"), default=False),
            }
        )

    no_overlap_groups: List[Dict[str, Any]] = []
    for row in no_overlap_rows:
        no_overlap_groups.append(
            {
                "id": _required_str(row, "id", "NoOverlapGroups"),
                "member_section_ids": parse_list_cell(row.get("member_section_ids")),
                "reason": _required_str(row, "reason", "NoOverlapGroups"),
            }
        )

    blocked_times: List[Dict[str, Any]] = []
    for row in blocked_rows:
        blocked_times.append(
            {
                "scope": _required_str(row, "scope", "BlockedTimes"),
                "timeslot_ids": parse_list_cell(row.get("timeslot_ids")),
                "reason": _required_str(row, "reason", "BlockedTimes"),
            }
        )

    locked_assignments: List[Dict[str, Any]] = []
    for row in locked_rows:
        lock: Dict[str, Any] = {"section_id": _required_str(row, "section_id", "LockedAssignments")}
        fixed_timeslot_set = parse_list_cell(row.get("fixed_timeslot_set"))
        fixed_room = maybe_str(row.get("fixed_room"))
        if fixed_timeslot_set:
            lock["fixed_timeslot_set"] = fixed_timeslot_set
        if fixed_room:
            lock["fixed_room"] = fixed_room
        locked_assignments.append(lock)

    soft_locks: List[Dict[str, Any]] = []
    for row in soft_rows:
        lock: Dict[str, Any] = {"section_id": _required_str(row, "section_id", "SoftLocks")}
        preferred_timeslot_set = parse_list_cell(row.get("preferred_timeslot_set"))
        preferred_room = maybe_str(row.get("preferred_room"))
        weight = maybe_float(row.get("weight"))
        lock["weight"] = weight if weight is not None else 1.0
        if preferred_timeslot_set:
            lock["preferred_timeslot_set"] = preferred_timeslot_set
        if preferred_room:
            lock["preferred_room"] = preferred_room
        soft_locks.append(lock)

    return {
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
    }


def _read_rows(workbook, sheet_name: str) -> List[Dict[str, Any]]:
    if sheet_name not in workbook.sheetnames:
        raise ValueError(f"Missing required sheet: {sheet_name}")

    ws = workbook[sheet_name]
    spec = SHEET_NAME_TO_SPEC[sheet_name]
    header_cells = next(ws.iter_rows(min_row=1, max_row=1, values_only=True), None)
    if header_cells is None:
        raise ValueError(f"Sheet '{sheet_name}' is empty.")

    headers = [str(v).strip() if v is not None else "" for v in header_cells]
    expected = spec.columns
    if headers[: len(expected)] != expected:
        raise ValueError(
            f"Sheet '{sheet_name}' has invalid headers. "
            f"Expected: {expected}. Found: {headers[:len(expected)]}"
        )

    rows: List[Dict[str, Any]] = []
    for values in ws.iter_rows(min_row=2, values_only=True):
        if values is None:
            continue
        active_values = values[: len(expected)]
        if all(v is None or str(v).strip() == "" for v in active_values):
            continue
        row = {column: active_values[idx] if idx < len(active_values) else None for idx, column in enumerate(expected)}
        rows.append(row)
    return rows


def _required_str(row: Dict[str, Any], key: str, sheet: str) -> str:
    value = maybe_str(row.get(key))
    if value is None:
        raise ValueError(f"Sheet '{sheet}' missing required value for '{key}'.")
    return value


def _required_int(row: Dict[str, Any], key: str, sheet: str) -> int:
    value = maybe_int(row.get(key))
    if value is None:
        raise ValueError(f"Sheet '{sheet}' has invalid or empty integer '{key}'.")
    return value

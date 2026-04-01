from __future__ import annotations

from io import BytesIO
from typing import Any, Dict

from openpyxl import Workbook

try:
    from spreadsheet_io.spreadsheet_utils import (
        SPREADSHEET_SPECS,
        format_room_number_for_export,
        serialize_list_cell,
        serialize_nested_list_cell,
    )
except ModuleNotFoundError:
    from spreadsheet_utils import (  # type: ignore[no-redef]
        SPREADSHEET_SPECS,
        format_room_number_for_export,
        serialize_list_cell,
        serialize_nested_list_cell,
    )


def scheduling_input_to_excel_bytes(payload: Dict[str, Any]) -> bytes:
    workbook = Workbook()
    default_ws = workbook.active
    workbook.remove(default_ws)

    for spec in SPREADSHEET_SPECS:
        ws = workbook.create_sheet(spec.name)
        ws.append(spec.columns)
        rows = _rows_for_sheet(spec.name, payload)
        for row in rows:
            ws.append([row.get(column, "") for column in spec.columns])

    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def _rows_for_sheet(sheet_name: str, payload: Dict[str, Any]) -> list[Dict[str, Any]]:
    if sheet_name == "Sections":
        return [
            {
                "id": item.get("id", ""),
                "course_id": item.get("course_id", ""),
                "department": item.get("department") or "",
                "section_code": item.get("section_code", ""),
                "instructor_id": item.get("instructor_id", ""),
                "expected_enrollment": item.get("expected_enrollment", ""),
                "enrollment_cap": item.get("enrollment_cap", ""),
                "allowed_meeting_patterns": serialize_list_cell(
                    item.get("allowed_meeting_patterns")
                ),
                "room_requirements": serialize_list_cell(item.get("room_requirements")),
                "crosslist_group_id": item.get("crosslist_group_id") or "",
                "tags": serialize_list_cell(item.get("tags")),
                "previous_meeting_pattern": item.get("previous_meeting_pattern") or "",
            }
            for item in payload.get("sections", [])
        ]
    if sheet_name == "Instructors":
        rows = []
        for item in payload.get("instructors", []):
            preferences = item.get("preferences") or {}
            rows.append(
                {
                    "id": item.get("id", ""),
                    "name": item.get("name") or "",
                    "rank_type": item.get("rank_type", ""),
                    "unavailable_times": serialize_list_cell(item.get("unavailable_times")),
                    "preferred_days": serialize_list_cell(preferences.get("preferred_days")),
                    "preferred_patterns": serialize_list_cell(
                        preferences.get("preferred_patterns")
                    ),
                    "max_teaching_days": preferences.get("max_teaching_days") or "",
                }
            )
        return rows
    if sheet_name == "Rooms":
        return [
            {
                "id": item.get("id", ""),
                "building": item.get("building", ""),
                "room_number": format_room_number_for_export(item.get("room_number", "")),
                "capacity": item.get("capacity", ""),
                "features": serialize_list_cell(item.get("features")),
            }
            for item in payload.get("rooms", [])
        ]
    if sheet_name == "Timeslots":
        return [
            {
                "id": item.get("id", ""),
                "day": item.get("day", ""),
                "start_time": item.get("start_time", ""),
                "end_time": item.get("end_time", ""),
                "slot_type": item.get("slot_type", "") or "",
            }
            for item in payload.get("timeslots", [])
        ]
    if sheet_name == "MeetingPatterns":
        return [
            {
                "id": item.get("id", ""),
                "slots_required": item.get("slots_required", ""),
                "allowed_days": serialize_list_cell(item.get("allowed_days")),
                "compatible_timeslot_sets": serialize_nested_list_cell(
                    item.get("compatible_timeslot_sets")
                ),
            }
            for item in payload.get("meeting_patterns", [])
        ]
    if sheet_name == "CrosslistGroups":
        return [
            {
                "id": item.get("id", ""),
                "member_section_ids": serialize_list_cell(item.get("member_section_ids")),
                "require_same_room": bool(item.get("require_same_room", False)),
            }
            for item in payload.get("crosslist_groups", [])
        ]
    if sheet_name == "NoOverlapGroups":
        return [
            {
                "id": item.get("id", ""),
                "member_section_ids": serialize_list_cell(item.get("member_section_ids")),
                "reason": item.get("reason", ""),
            }
            for item in payload.get("no_overlap_groups", [])
        ]
    if sheet_name == "BlockedTimes":
        return [
            {
                "scope": item.get("scope", ""),
                "timeslot_ids": serialize_list_cell(item.get("timeslot_ids")),
                "reason": item.get("reason", ""),
            }
            for item in payload.get("blocked_times", [])
        ]
    if sheet_name == "LockedAssignments":
        return [
            {
                "section_id": item.get("section_id", ""),
                "fixed_timeslot_set": serialize_list_cell(item.get("fixed_timeslot_set")),
                "fixed_room": item.get("fixed_room") or "",
            }
            for item in payload.get("locked_assignments", [])
        ]
    if sheet_name == "SoftLocks":
        return [
            {
                "section_id": item.get("section_id", ""),
                "preferred_timeslot_set": serialize_list_cell(item.get("preferred_timeslot_set")),
                "preferred_room": item.get("preferred_room") or "",
                "weight": item.get("weight", 1.0),
            }
            for item in payload.get("soft_locks", [])
        ]
    return []

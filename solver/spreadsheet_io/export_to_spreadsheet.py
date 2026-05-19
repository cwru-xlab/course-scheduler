from __future__ import annotations

from io import BytesIO
from typing import Any, Dict

from openpyxl import Workbook

try:
    from spreadsheet_io.spreadsheet_utils import (
        SPREADSHEET_SPECS,
        normalize_spreadsheet_string_cell,
        serialize_list_cell,
        serialize_nested_list_cell,
    )
except ModuleNotFoundError:
    from spreadsheet_utils import (  # type: ignore[no-redef]
        SPREADSHEET_SPECS,
        normalize_spreadsheet_string_cell,
        serialize_list_cell,
        serialize_nested_list_cell,
    )


def _export_str(value: Any) -> str:
    """Normalize string/ID cells so Excel does not show spurious `.0`."""
    return normalize_spreadsheet_string_cell(value)


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
                "id": _export_str(item.get("id", "")),
                "course_id": _export_str(item.get("course_id", "")),
                "department": _export_str(item.get("department") or ""),
                "section_code": _export_str(item.get("section_code", "")),
                "instructor_id": _export_str(item.get("instructor_id", "")),
                "expected_enrollment": item.get("expected_enrollment", ""),
                "enrollment_cap": item.get("enrollment_cap", ""),
                "allowed_meeting_patterns": serialize_list_cell(
                    item.get("allowed_meeting_patterns")
                ),
                "room_requirements": serialize_list_cell(item.get("room_requirements")),
                "crosslist_group_id": _export_str(item.get("crosslist_group_id") or ""),
                "tags": serialize_list_cell(item.get("tags")),
                "previous_meeting_pattern": _export_str(
                    item.get("previous_meeting_pattern") or ""
                ),
                "state": _export_str(item.get("state") or "active"),
            }
            for item in payload.get("sections", [])
        ]
    if sheet_name == "Instructors":
        rows = []
        for item in payload.get("instructors", []):
            preferences = item.get("preferences") or {}
            rows.append(
                {
                    "id": _export_str(item.get("id", "")),
                    "name": _export_str(item.get("name") or ""),
                    "rank_type": _export_str(item.get("rank_type", "")),
                    "unavailable_times": serialize_list_cell(item.get("unavailable_times")),
                    "preferred_days": serialize_list_cell(preferences.get("preferred_days")),
                    "preferred_patterns": serialize_list_cell(
                        preferences.get("preferred_patterns")
                    ),
                    "max_teaching_days": _export_str(
                        preferences.get("max_teaching_days") or ""
                    ),
                }
            )
        return rows
    if sheet_name == "Rooms":
        return [
            {
                "id": _export_str(item.get("id", "")),
                "building": _export_str(item.get("building", "")),
                "room_number": _export_str(item.get("room_number", "")),
                "capacity": item.get("capacity", ""),
                "features": serialize_list_cell(item.get("features")),
            }
            for item in payload.get("rooms", [])
        ]
    if sheet_name == "Timeslots":
        return [
            {
                "id": _export_str(item.get("id", "")),
                "day": _export_str(item.get("day", "")),
                "start_time": _export_str(item.get("start_time", "")),
                "end_time": _export_str(item.get("end_time", "")),
                "slot_type": _export_str(item.get("slot_type", "") or ""),
            }
            for item in payload.get("timeslots", [])
        ]
    if sheet_name == "MeetingPatterns":
        return [
            {
                "id": _export_str(item.get("id", "")),
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
                "id": _export_str(item.get("id", "")),
                "member_section_ids": serialize_list_cell(item.get("member_section_ids")),
            }
            for item in payload.get("crosslist_groups", [])
        ]
    if sheet_name == "NoOverlapGroups":
        return [
            {
                "id": _export_str(item.get("id", "")),
                "member_section_ids": serialize_list_cell(item.get("member_section_ids")),
                "reason": _export_str(item.get("reason", "")),
            }
            for item in payload.get("no_overlap_groups", [])
        ]
    if sheet_name == "BlockedTimes":
        return [
            {
                "scope": _export_str(item.get("scope", "")),
                "days": _export_str(item.get("days", "")),
                "start_time": _export_str(item.get("start_time", "")),
                "end_time": _export_str(item.get("end_time", "")),
                "instructor_id": _export_str(item.get("instructor_id", "")),
                "room_id": _export_str(item.get("room_id", "")),
                "timeslot_ids": serialize_list_cell(item.get("timeslot_ids")),
                "reason": _export_str(item.get("reason", "")),
            }
            for item in payload.get("blocked_times", [])
        ]
    if sheet_name == "LockedAssignments":
        return [
            {
                "section_id": _export_str(item.get("section_id", "")),
                "fixed_timeslot_set": serialize_list_cell(item.get("fixed_timeslot_set")),
                "fixed_room": _export_str(item.get("fixed_room") or ""),
            }
            for item in payload.get("locked_assignments", [])
        ]
    if sheet_name == "SoftLocks":
        return [
            {
                "section_id": _export_str(item.get("section_id", "")),
                "preferred_timeslot_set": serialize_list_cell(item.get("preferred_timeslot_set")),
                "preferred_room": _export_str(item.get("preferred_room") or ""),
                "weight": item.get("weight", 1.0),
            }
            for item in payload.get("soft_locks", [])
        ]
    return []

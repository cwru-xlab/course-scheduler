"""Spreadsheet import tests for duration column and legacy header schemas."""

from __future__ import annotations

import unittest
from io import BytesIO

from openpyxl import Workbook

from spreadsheet_io.import_from_spreadsheet import parse_scheduling_input_from_excel_bytes
from spreadsheet_io.spreadsheet_utils import LEGACY_SHEET_COLUMNS_V3, SHEET_NAME_TO_SPEC, normalize_sheet_headers


def _minimal_workbook_bytes(sections_headers: list[str], sections_row: list[object]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Sections"
    ws.append(sections_headers)
    ws.append(sections_row)

    for sheet_name, headers, row in [
        (
            "Instructors",
            ["id", "name", "rank_type", "unavailable_times", "preferred_days", "preferred_patterns", "max_teaching_days"],
            ["inst-1", "Prof One", "Adjunct", "", "", "", ""],
        ),
        ("Rooms", ["id", "building", "room_number", "capacity", "features"], ["R1", "Main", "101", 40, ""]),
        ("Timeslots", ["id", "day", "start_time", "end_time", "slot_type"], ["ts-1", "Mon", "18:15", "19:45", "evening"]),
        (
            "MeetingPatterns",
            ["id", "slots_required", "allowed_days", "compatible_timeslot_sets"],
            ["mp-1", 1, "Mon", "ts-1"],
        ),
        ("CrosslistGroups", ["id", "member_section_ids"], []),
        ("NoOverlapGroups", ["id", "member_section_ids", "reason"], []),
        ("BlockedTimes", ["scope", "days", "start_time", "end_time", "instructor_id", "room_id", "timeslot_ids", "reason"], []),
        ("LockedAssignments", ["section_id", "fixed_timeslot_set", "fixed_room"], []),
        ("SoftLocks", ["section_id", "preferred_timeslot_set", "preferred_room", "weight"], []),
    ]:
        sheet = wb.create_sheet(sheet_name)
        if headers:
            sheet.append(headers)
        if row:
            sheet.append(row)

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


class TestTermSpreadsheetImport(unittest.TestCase):
    def test_normalize_sheet_headers_accepts_v3_legacy_without_duration(self) -> None:
        headers = LEGACY_SHEET_COLUMNS_V3["Sections"] + ["prev_notes", "new_notes"]
        normalized = normalize_sheet_headers("Sections", headers)
        self.assertNotIn("assigned_half", normalized)
        self.assertIn("section_number", normalized)

    def test_import_v3_legacy_defaults_semester_length_to_full(self) -> None:
        headers = LEGACY_SHEET_COLUMNS_V3["Sections"]
        row = [
            "sec-v3",
            "COURSE1",
            "MBAP",
            "400-LEC",
            "400",
            "inst-1",
            20,
            25,
            "mp-1",
            "",
            "",
            "mbap",
            "",
            "active",
        ]
        payload = parse_scheduling_input_from_excel_bytes(_minimal_workbook_bytes(headers, row))
        section = payload["sections"][0]
        self.assertEqual(section["id"], "sec-v3")
        self.assertEqual(section["semester_length"], "full")
        self.assertIsNone(section.get("assigned_half"))

    def test_import_reads_duration_and_assigned_half(self) -> None:
        spec = SHEET_NAME_TO_SPEC["Sections"]
        scheduling_columns = [c for c in spec.columns if c not in ("prev_notes", "new_notes")]
        headers = scheduling_columns
        row_by_col = {
            "id": "sec-half",
            "course_id": "COURSE1",
            "department": "MBAP",
            "section_code": "400-LEC",
            "section_number": "400",
            "instructor_id": "inst-1",
            "expected_enrollment": 20,
            "enrollment_cap": 25,
            "allowed_meeting_patterns": "mp-1",
            "room_requirements": "",
            "crosslist_group_id": "",
            "tags": "mbap",
            "duration": "Half (any)",
            "assigned_half": "First Half",
            "previous_meeting_pattern": "",
            "state": "active",
        }
        row = [row_by_col[col] for col in headers]
        payload = parse_scheduling_input_from_excel_bytes(_minimal_workbook_bytes(headers, row))
        section = payload["sections"][0]
        self.assertEqual(section["semester_length"], "half_any")
        self.assertEqual(section["assigned_half"], "first_half")


if __name__ == "__main__":
    unittest.main()

"""Tests for Online Schedule spreadsheet export."""

from __future__ import annotations

import unittest

from spreadsheet_io.online_schedule_export import (
    build_online_schedule_rows,
    build_online_schedule_sheet_rows,
    expand_timeslot_weekdays,
)


class OnlineScheduleExportTests(unittest.TestCase):
    def test_expand_timeslot_weekdays_mwf(self) -> None:
        days = expand_timeslot_weekdays({"days": "MWF", "start_time": "09:00", "end_time": "10:00"})
        self.assertEqual(days, ["Mon", "Wed", "Fri"])

    def test_expand_timeslot_weekdays_single_day(self) -> None:
        days = expand_timeslot_weekdays({"day": "Monday", "start_time": "09:00", "end_time": "10:00"})
        self.assertEqual(days, ["Mon"])

    def test_build_rows_from_locked_online_assignment(self) -> None:
        payload = {
            "sections": [
                {
                    "id": "sec-online",
                    "course_id": "Virtual Leadership",
                    "department": "MGMT",
                    "section_code": "850",
                    "section_number": "801",
                    "instructor_id": "inst-1",
                    "state": "active",
                }
            ],
            "instructors": [{"id": "inst-1", "name": "Dr. Smith"}],
            "timeslots": [
                {
                    "id": "ts-mon",
                    "days": "Mon",
                    "start_time": "09:00",
                    "end_time": "10:15",
                }
            ],
            "locked_assignments": [
                {
                    "section_id": "sec-online",
                    "fixed_timeslot_set": ["ts-mon"],
                }
            ],
        }

        rows = build_online_schedule_rows(payload)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["Day"], "Mon")
        self.assertEqual(rows[0]["Start"], "09:00")
        self.assertEqual(rows[0]["Instructor"], "Dr. Smith")
        self.assertEqual(rows[0]["Section"], "801")

    def test_archived_online_sections_are_excluded(self) -> None:
        payload = {
            "sections": [
                {
                    "id": "sec-online",
                    "course_id": "Virtual Leadership",
                    "department": "MGMT",
                    "section_code": "850",
                    "section_number": "801",
                    "instructor_id": "inst-1",
                    "state": "archived",
                }
            ],
            "instructors": [{"id": "inst-1", "name": "Dr. Smith"}],
            "timeslots": [
                {
                    "id": "ts-mon",
                    "days": "Mon",
                    "start_time": "09:00",
                    "end_time": "10:15",
                }
            ],
            "locked_assignments": [
                {
                    "section_id": "sec-online",
                    "fixed_timeslot_set": ["ts-mon"],
                }
            ],
        }

        self.assertEqual(build_online_schedule_rows(payload), [])

    def test_sheet_rows_include_day_headers(self) -> None:
        payload = {
            "sections": [
                {
                    "id": "sec-online",
                    "course_id": "Virtual Leadership",
                    "department": "MGMT",
                    "section_code": "850",
                    "section_number": "801",
                    "instructor_id": "inst-1",
                    "state": "active",
                }
            ],
            "instructors": [{"id": "inst-1", "name": "Dr. Smith"}],
            "timeslots": [
                {
                    "id": "ts-mon",
                    "days": "Mon",
                    "start_time": "09:00",
                    "end_time": "10:15",
                }
            ],
            "locked_assignments": [
                {
                    "section_id": "sec-online",
                    "fixed_timeslot_set": ["ts-mon"],
                }
            ],
        }

        sheet_rows = build_online_schedule_sheet_rows(payload)
        self.assertEqual(sheet_rows[0][0], "Read-only summary. Edit sections and locks on entity sheets.")
        self.assertEqual(sheet_rows[2][0], "Mon")
        self.assertEqual(sheet_rows[3][1], "09:00")


if __name__ == "__main__":
    unittest.main()

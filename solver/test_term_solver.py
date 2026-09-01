"""Solver tests for term-aware room/instructor conflicts."""

from __future__ import annotations

import unittest

from app import SchedulingInput, _check_feasible, _solve_schedule


def _half_term_input(
    *,
    term_a: str,
    term_b: str,
    instructor_b: str = "inst-2",
) -> SchedulingInput:
    return SchedulingInput(
        {
            "sections": [
                {
                    "id": "s-a",
                    "course_id": "C101",
                    "instructor_id": "inst-1",
                    "section_number": "1",
                    "term": term_a,
                    "allowed_meeting_patterns": ["MWF_60"],
                    "enrollment_cap": 30,
                    "expected_enrollment": 20,
                },
                {
                    "id": "s-b",
                    "course_id": "C102",
                    "instructor_id": instructor_b,
                    "section_number": "2",
                    "term": term_b,
                    "allowed_meeting_patterns": ["MWF_60"],
                    "enrollment_cap": 30,
                    "expected_enrollment": 20,
                },
            ],
            "instructors": [
                {
                    "id": "inst-1",
                    "name": "Prof One",
                    "rank_type": "tenured",
                    "unavailable_times": [],
                },
                {
                    "id": "inst-2",
                    "name": "Prof Two",
                    "rank_type": "tenured",
                    "unavailable_times": [],
                },
            ],
            "rooms": [
                {"id": "R1", "building": "A", "room_number": "101", "capacity": 40},
            ],
            "timeslots": [
                {
                    "id": "ts-mwf-9",
                    "day": "Monday",
                    "start_time": "09:00",
                    "end_time": "10:00",
                },
            ],
            "meeting_patterns": [
                {
                    "id": "MWF_60",
                    "compatible_timeslot_sets": [["ts-mwf-9"]],
                }
            ],
            "crosslist_groups": [],
        }
    )


class TestTermAwareFeasibility(unittest.TestCase):
    def test_first_and_second_half_share_room(self) -> None:
        input_data = _half_term_input(term_a="first_half", term_b="second_half")
        self.assertTrue(_check_feasible(input_data))

    def test_full_and_first_half_conflict(self) -> None:
        input_data = _half_term_input(term_a="full", term_b="first_half")
        self.assertFalse(_check_feasible(input_data))

    def test_same_half_conflict(self) -> None:
        input_data = _half_term_input(term_a="first_half", term_b="first_half")
        self.assertFalse(_check_feasible(input_data))


class TestTermAwareSolve(unittest.TestCase):
    def test_solve_assigns_both_halves_same_slot(self) -> None:
        input_data = _half_term_input(term_a="first_half", term_b="second_half")
        result = _solve_schedule(input_data)
        self.assertEqual(result.get("status"), "ok")
        assignments = result.get("assignments", [])
        self.assertEqual(len(assignments), 2)
        slot_sets = {tuple(a["timeslot_ids"]) for a in assignments}
        self.assertEqual(len(slot_sets), 1)

    def test_half_any_gets_assigned_half(self) -> None:
        input_data = _half_term_input(term_a="half_any", term_b="second_half")
        result = _solve_schedule(input_data)
        self.assertEqual(result.get("status"), "ok")
        by_id = {a["section_id"]: a for a in result.get("assignments", [])}
        self.assertIn("assigned_half", by_id["s-a"])
        self.assertIn(by_id["s-a"]["assigned_half"], ("first_half", "second_half"))


if __name__ == "__main__":
    unittest.main()

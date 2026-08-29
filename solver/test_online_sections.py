"""Tests for online section modeling (section_number 800–899)."""

from __future__ import annotations

import unittest

from app import (
    SchedulingInput,
    _build_options,
    _check_feasible,
    _crosslist_options_incompatible,
    _solve_schedule,
    _validate_crosslist_capacity,
)
from online_sections import ONLINE_ROOM_SENTINEL, is_online_section


def _minimal_input(
    *,
    sections: list[dict],
    rooms: list[dict] | None = None,
    crosslist_groups: list[dict] | None = None,
) -> SchedulingInput:
  return SchedulingInput(
      {
          "sections": sections,
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
          "rooms": rooms
          if rooms is not None
          else [{"id": "R1", "building": "A", "room_number": "101", "capacity": 40}],
          "timeslots": [
              {
                  "id": "ts-mwf-9",
                  "day": "Monday",
                  "start_time": "09:00",
                  "end_time": "10:00",
              },
              {
                  "id": "ts-mwf-10",
                  "day": "Monday",
                  "start_time": "10:00",
                  "end_time": "11:00",
              },
          ],
          "meeting_patterns": [
              {
                  "id": "MWF_60",
                  "compatible_timeslot_sets": [["ts-mwf-9"], ["ts-mwf-10"]],
              }
          ],
          "crosslist_groups": crosslist_groups or [],
      }
  )


class TestOnlineSectionDetection(unittest.TestCase):
    def test_section_number_boundaries(self) -> None:
        self.assertFalse(is_online_section({"section_number": "799"}))
        self.assertTrue(is_online_section({"section_number": "800"}))
        self.assertTrue(is_online_section({"section_number": "899"}))
        self.assertFalse(is_online_section({"section_number": "900"}))
        self.assertFalse(is_online_section({"section_number": ""}))
        self.assertFalse(is_online_section({"section_number": "8A0"}))


class TestBuildOptions(unittest.TestCase):
    def test_online_section_gets_sentinel_without_physical_rooms(self) -> None:
        input_data = _minimal_input(
            sections=[
                {
                    "id": "s-online",
                    "course_id": "ONL101",
                    "instructor_id": "inst-1",
                    "section_number": "801",
                    "allowed_meeting_patterns": ["MWF_60"],
                    "enrollment_cap": 30,
                }
            ],
            rooms=[],
        )
        options, errors = _build_options(input_data)
        self.assertEqual(errors, [])
        self.assertIn("s-online", options)
        self.assertTrue(options["s-online"])
        for _pattern, _times, room_id, waste in options["s-online"]:
            self.assertEqual(room_id, ONLINE_ROOM_SENTINEL)
            self.assertEqual(waste, 0)

    def test_in_person_section_still_requires_room(self) -> None:
        input_data = _minimal_input(
            sections=[
                {
                    "id": "s-room",
                    "course_id": "ACC101",
                    "instructor_id": "inst-1",
                    "section_number": "101",
                    "allowed_meeting_patterns": ["MWF_60"],
                    "enrollment_cap": 30,
                }
            ],
        )
        options, errors = _build_options(input_data)
        self.assertEqual(errors, [])
        room_ids = {room_id for *_rest, room_id, _waste in options["s-room"]}
        self.assertEqual(room_ids, {"R1"})

    def test_in_person_fails_without_rooms(self) -> None:
        input_data = _minimal_input(
            sections=[
                {
                    "id": "s-room",
                    "course_id": "ACC101",
                    "instructor_id": "inst-1",
                    "section_number": "101",
                    "allowed_meeting_patterns": ["MWF_60"],
                    "enrollment_cap": 30,
                }
            ],
            rooms=[],
        )
        _options, errors = _build_options(input_data)
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["code"], "no_feasible_options")


class TestCrosslistCompatibility(unittest.TestCase):
    def test_mixed_online_in_person_same_timeslot_different_rooms_compatible(self) -> None:
        online = {"section_number": "801"}
        in_person = {"section_number": "101"}
        option_online = ("MWF_60", ("ts-mwf-9",), ONLINE_ROOM_SENTINEL, 0)
        option_room = ("MWF_60", ("ts-mwf-9",), "R1", 10)
        self.assertFalse(
            _crosslist_options_incompatible(option_online, option_room, online, in_person)
        )

    def test_in_person_crosslist_requires_same_room(self) -> None:
        a = {"section_number": "101"}
        b = {"section_number": "102"}
        option_a = ("MWF_60", ("ts-mwf-9",), "R1", 10)
        option_b = ("MWF_60", ("ts-mwf-9",), "R2", 10)
        self.assertTrue(_crosslist_options_incompatible(option_a, option_b, a, b))


class TestCrosslistCapacityValidation(unittest.TestCase):
    def test_all_online_group_skips_room_capacity(self) -> None:
        errors = _validate_crosslist_capacity(
            [{"id": "xl-1", "member_section_ids": ["s1", "s2"]}],
            [
                {"id": "s1", "section_number": "801", "enrollment_cap": 500},
                {"id": "s2", "section_number": "802", "enrollment_cap": 500},
            ],
            [{"id": "R1", "capacity": 40}],
        )
        self.assertEqual(errors, [])


class TestInstructorConflicts(unittest.TestCase):
    def test_same_instructor_two_online_same_slot_infeasible(self) -> None:
        input_data = SchedulingInput(
            {
                "sections": [
                    {
                        "id": "s-online-a",
                        "course_id": "ONL101",
                        "instructor_id": "inst-1",
                        "section_number": "801",
                        "allowed_meeting_patterns": ["MWF_60"],
                        "enrollment_cap": 30,
                    },
                    {
                        "id": "s-online-b",
                        "course_id": "ONL102",
                        "instructor_id": "inst-1",
                        "section_number": "802",
                        "allowed_meeting_patterns": ["MWF_60"],
                        "enrollment_cap": 30,
                    },
                ],
                "instructors": [
                    {
                        "id": "inst-1",
                        "name": "Prof One",
                        "rank_type": "tenured",
                        "unavailable_times": [],
                    },
                ],
                "rooms": [],
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
            }
        )
        self.assertFalse(_check_feasible(input_data))

    def test_different_instructors_two_online_same_slot_feasible(self) -> None:
        input_data = _minimal_input(
            sections=[
                {
                    "id": "s-online-a",
                    "course_id": "ONL101",
                    "instructor_id": "inst-1",
                    "section_number": "801",
                    "allowed_meeting_patterns": ["MWF_60"],
                    "enrollment_cap": 30,
                },
                {
                    "id": "s-online-b",
                    "course_id": "ONL102",
                    "instructor_id": "inst-2",
                    "section_number": "802",
                    "allowed_meeting_patterns": ["MWF_60"],
                    "enrollment_cap": 30,
                },
            ],
            rooms=[],
        )
        self.assertTrue(_check_feasible(input_data))


class TestSolveOutput(unittest.TestCase):
    def test_online_assignment_uses_sentinel_room(self) -> None:
        input_data = _minimal_input(
            sections=[
                {
                    "id": "s-online",
                    "course_id": "ONL101",
                    "instructor_id": "inst-1",
                    "section_number": "850",
                    "allowed_meeting_patterns": ["MWF_60"],
                    "enrollment_cap": 30,
                }
            ],
            rooms=[],
        )
        result = _solve_schedule(input_data)
        self.assertEqual(result["status"], "ok")
        assignment = result["assignments"][0]
        self.assertEqual(assignment["section_id"], "s-online")
        self.assertEqual(assignment["room_id"], ONLINE_ROOM_SENTINEL)
        self.assertTrue(assignment["timeslot_ids"])


if __name__ == "__main__":
    unittest.main()

"""Roundtrip tests for multi-day timeslot_ids on /update-sections."""

from __future__ import annotations

import unittest

from app import app, db


class TestUpdateSectionsTimeslotIds(unittest.TestCase):
    def setUp(self) -> None:
        self.client = app.test_client()
        self.app_context = app.app_context()
        self.app_context.push()
        db.create_all()

    def tearDown(self) -> None:
        db.session.rollback()
        self.app_context.pop()

    def test_roundtrip_multi_day_timeslot_ids(self) -> None:
        payload = {
            "sections": [
                {
                    "id": "sec-test-mw-persist",
                    "course_id": "COURSE-TEST-MW",
                    "section_code": "TESTMW",
                    "section_number": "001",
                    "instructor_id": "INST-TEST-MW",
                    "room_id": "ROOM-TEST-MW",
                    "timeslot_ids": ["ts-mon-9", "ts-wed-9"],
                    "expected_enrollment": 20,
                    "enrollment_cap": 25,
                    "allowed_meeting_patterns": [],
                    "room_requirements": [],
                    "tags": [],
                }
            ]
        }
        post_res = self.client.post("/update-sections", json=payload)
        self.assertEqual(post_res.status_code, 200)
        self.assertEqual(post_res.get_json().get("status"), "ok")

        get_res = self.client.get("/data")
        self.assertEqual(get_res.status_code, 200)
        body = get_res.get_json()
        self.assertEqual(body.get("status"), "ok")
        sections = body["data"]["sections"]
        section = next(s for s in sections if s["id"] == "sec-test-mw-persist")
        self.assertEqual(section["timeslot_ids"], ["ts-mon-9", "ts-wed-9"])
        self.assertEqual(section["timeslot_id"], "ts-mon-9")


if __name__ == "__main__":
    unittest.main()

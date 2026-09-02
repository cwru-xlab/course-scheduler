"""Unit tests for MBAP import constants and helpers."""

import unittest

from mbap_constants import (
    MBAP_ON_CAMPUS_PATTERNS,
    MBAP_ONLINE_PATTERNS,
    MBAP_TAG,
    apply_mbap_section_metadata,
    is_mbap_course,
    mbap_allowed_patterns,
    session_half_tags,
)


class MbapConstantsTests(unittest.TestCase):
    def test_is_mbap_course(self) -> None:
        self.assertTrue(is_mbap_course("MBAP", "MBAP474"))
        self.assertTrue(is_mbap_course("", "MBAP500"))
        self.assertFalse(is_mbap_course("ACCT", "ACCT101"))

    def test_section_number_patterns(self) -> None:
        self.assertEqual(mbap_allowed_patterns("400"), MBAP_ON_CAMPUS_PATTERNS)
        self.assertEqual(mbap_allowed_patterns("801"), MBAP_ONLINE_PATTERNS)
        self.assertIsNone(mbap_allowed_patterns("100"))

    def test_session_half_tags(self) -> None:
        self.assertEqual(session_half_tags("Virt Sess1"), ["half-1"])
        self.assertEqual(session_half_tags("Reg 2 Half"), ["half-2"])
        self.assertEqual(session_half_tags("Regular"), [])

    def test_apply_mbap_section_metadata(self) -> None:
        section = {
            "id": "s1",
            "course_id": "MBAP474",
            "section_number": "400",
            "tags": [],
            "allowed_meeting_patterns": [],
        }
        warnings = apply_mbap_section_metadata(section, "MBAP", "Virt Sess1")
        self.assertEqual(warnings, [])
        self.assertIn(MBAP_TAG, section["tags"])
        self.assertEqual(section.get("semester_length"), "first_half")
        self.assertNotIn("half-1", section["tags"])
        self.assertEqual(section["allowed_meeting_patterns"], MBAP_ON_CAMPUS_PATTERNS)


if __name__ == "__main__":
    unittest.main()

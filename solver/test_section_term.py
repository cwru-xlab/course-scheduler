"""Tests for section term helpers and term-aware conflict rules."""

import unittest

from section_term import (
    DEFAULT_SECTION_TERM,
    normalize_section_term,
    resolve_half_any_half,
    resolve_section_term,
    session_to_term,
    slot_has_term_conflict,
    terms_conflict,
)


class TestNormalizeSectionTerm(unittest.TestCase):
    def test_defaults(self):
        self.assertEqual(normalize_section_term(None), DEFAULT_SECTION_TERM)
        self.assertEqual(normalize_section_term(""), DEFAULT_SECTION_TERM)
        self.assertEqual(normalize_section_term("full"), "full")

    def test_aliases(self):
        self.assertEqual(normalize_section_term("1st half"), "first_half")
        self.assertEqual(normalize_section_term("half"), "half_any")
        self.assertEqual(normalize_section_term("H2"), "second_half")


class TestSessionToTerm(unittest.TestCase):
    def test_first_half_sessions(self):
        self.assertEqual(session_to_term("Virt Sess1"), "first_half")
        self.assertEqual(session_to_term("Half 1"), "first_half")

    def test_second_half_sessions(self):
        self.assertEqual(session_to_term("Reg 2 Half"), "second_half")
        self.assertEqual(session_to_term("Virt Sess2"), "second_half")

    def test_ambiguous_half(self):
        self.assertEqual(session_to_term("Half"), "half_any")

    def test_full_sessions(self):
        self.assertEqual(session_to_term("Regular"), "full")
        self.assertEqual(session_to_term("Dyn Dt"), "full")


class TestTermsConflict(unittest.TestCase):
    def test_first_and_second_half_compatible(self):
        self.assertFalse(terms_conflict("first_half", "second_half"))

    def test_full_conflicts_with_half(self):
        self.assertTrue(terms_conflict("full", "first_half"))
        self.assertTrue(terms_conflict("first_half", "full"))

    def test_same_half_conflicts(self):
        self.assertTrue(terms_conflict("first_half", "first_half"))
        self.assertTrue(terms_conflict("second_half", "second_half"))

    def test_half_any_against_fixed_half(self):
        self.assertFalse(terms_conflict("half_any", "first_half"))
        self.assertFalse(terms_conflict("second_half", "half_any"))

    def test_two_half_any_compatible(self):
        self.assertFalse(terms_conflict("half_any", "half_any"))

    def test_half_any_against_full(self):
        self.assertTrue(terms_conflict("half_any", "full"))

    def test_half_any_resolved(self):
        self.assertFalse(
            terms_conflict("half_any", "second_half", assigned_half_a="first_half")
        )
        self.assertTrue(
            terms_conflict("half_any", "first_half", assigned_half_a="first_half")
        )


class TestResolveHalfAnyHalf(unittest.TestCase):
    def test_defaults_to_first_half(self):
        self.assertEqual(resolve_half_any_half("half_any"), "first_half")

    def test_picks_open_half(self):
        self.assertEqual(
            resolve_half_any_half("half_any", occupied_halves=["first_half"]),
            "second_half",
        )


class TestSlotHasTermConflict(unittest.TestCase):
    def test_three_halves_conflict(self):
        self.assertTrue(
            slot_has_term_conflict(
                [
                    {"section_id": "a", "semester_length": "first_half"},
                    {"section_id": "b", "semester_length": "second_half"},
                    {"section_id": "c", "semester_length": "half_any"},
                ]
            )
        )


class TestResolveSectionTerm(unittest.TestCase):
    def test_explicit_semester_length(self):
        self.assertEqual(
            resolve_section_term({"semester_length": "first_half"}),
            "first_half",
        )

    def test_fallback_to_tags(self):
        self.assertEqual(
            resolve_section_term({"tags": ["half-2"]}),
            "second_half",
        )


if __name__ == "__main__":
    unittest.main()

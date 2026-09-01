"""Tests for section term helpers and term-aware conflict rules."""

import unittest

from section_term import (
    DEFAULT_SECTION_TERM,
    normalize_section_term,
    resolve_section_term,
    session_to_term,
    terms_conflict,
)


class TestNormalizeSectionTerm(unittest.TestCase):
    def test_defaults(self):
        self.assertEqual(normalize_section_term(None), DEFAULT_SECTION_TERM)
        self.assertEqual(normalize_section_term(""), DEFAULT_SECTION_TERM)
        self.assertEqual(normalize_section_term("full"), "full")

    def test_aliases(self):
        self.assertEqual(normalize_section_term("1st_half"), "first_half")
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

    def test_half_any_unresolved_conflicts(self):
        self.assertTrue(terms_conflict("half_any", "first_half"))
        self.assertTrue(terms_conflict("second_half", "half_any"))

    def test_half_any_resolved(self):
        self.assertFalse(
            terms_conflict("half_any", "second_half", assigned_half_a="first_half")
        )
        self.assertTrue(
            terms_conflict("half_any", "first_half", assigned_half_a="first_half")
        )


class TestResolveSectionTerm(unittest.TestCase):
    def test_explicit_term(self):
        self.assertEqual(resolve_section_term({"term": "first_half"}), "first_half")

    def test_fallback_to_tags(self):
        self.assertEqual(
            resolve_section_term({"tags": ["half-2"]}),
            "second_half",
        )


if __name__ == "__main__":
    unittest.main()

"""Section term (half-semester) constants and conflict helpers."""

from __future__ import annotations

from typing import Any, Optional

VALID_SECTION_TERMS = ("full", "half_any", "first_half", "second_half")
DEFAULT_SECTION_TERM = "full"

TERM_FULL = "full"
TERM_HALF_ANY = "half_any"
TERM_FIRST_HALF = "first_half"
TERM_SECOND_HALF = "second_half"


def normalize_section_term(value: Any) -> str:
    """Normalize a term value to a valid SectionTerm string."""
    raw = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "": DEFAULT_SECTION_TERM,
        "full": TERM_FULL,
        "full_semester": TERM_FULL,
        "half": TERM_HALF_ANY,
        "half_any": TERM_HALF_ANY,
        "any": TERM_HALF_ANY,
        "1st_half": TERM_FIRST_HALF,
        "first_half": TERM_FIRST_HALF,
        "first": TERM_FIRST_HALF,
        "h1": TERM_FIRST_HALF,
        "2nd_half": TERM_SECOND_HALF,
        "second_half": TERM_SECOND_HALF,
        "second": TERM_SECOND_HALF,
        "h2": TERM_SECOND_HALF,
    }
    return aliases.get(raw, DEFAULT_SECTION_TERM if raw not in VALID_SECTION_TERMS else raw)


def session_to_term(session: str, meeting_dates: str = "") -> str:
    """Map registrar Session (and optional Meeting Dates) to a section term value."""
    raw = (session or "").strip().lower()
    if not raw:
        return DEFAULT_SECTION_TERM
    if "sess1" in raw or "half 1" in raw or raw.startswith("half1"):
        return TERM_FIRST_HALF
    if "sess2" in raw or "half 2" in raw or "reg 2 half" in raw or raw.startswith("half2"):
        return TERM_SECOND_HALF
    if "half" in raw or "sess" in raw:
        return TERM_HALF_ANY
    return DEFAULT_SECTION_TERM


def effective_term_group(term: Any, assigned_half: Any = None) -> str:
    """
    Resolve a section's conflict group: full, first_half, second_half, or half_any (unresolved).
    """
    normalized = normalize_section_term(term)
    if normalized != TERM_HALF_ANY:
        return normalized
    if assigned_half is not None and str(assigned_half).strip():
        resolved = normalize_section_term(assigned_half)
        if resolved in (TERM_FIRST_HALF, TERM_SECOND_HALF):
            return resolved
    return TERM_HALF_ANY


def terms_conflict(
    term_a: Any,
    term_b: Any,
    assigned_half_a: Any = None,
    assigned_half_b: Any = None,
) -> bool:
    """
    Return True when two sections cannot share the same weekly room/instructor slot.
    Only first_half + second_half may coexist.
    """
    group_a = effective_term_group(term_a, assigned_half_a)
    group_b = effective_term_group(term_b, assigned_half_b)
    if group_a == TERM_HALF_ANY or group_b == TERM_HALF_ANY:
        return True
    if group_a == TERM_FULL or group_b == TERM_FULL:
        return True
    return group_a == group_b


def term_from_mbap_tags(tags: list[str] | None) -> Optional[str]:
    """Infer term from legacy half-1/half-2 MBAP tags when term column is missing."""
    tag_set = {str(t).strip().lower() for t in (tags or [])}
    if "half-1" in tag_set:
        return TERM_FIRST_HALF
    if "half-2" in tag_set:
        return TERM_SECOND_HALF
    return None


def normalize_assigned_half(value: Any) -> Optional[str]:
    """Normalize assigned_half to first_half, second_half, or None."""
    if value is None or not str(value).strip():
        return None
    normalized = normalize_section_term(value)
    if normalized in (TERM_FIRST_HALF, TERM_SECOND_HALF):
        return normalized
    return None


def resolve_section_term(section: dict) -> str:
    """Resolve term from section dict, falling back to MBAP tags then default."""
    explicit = section.get("term")
    if explicit is not None and str(explicit).strip():
        return normalize_section_term(explicit)
    from_tags = term_from_mbap_tags(section.get("tags"))
    if from_tags:
        return from_tags
    return DEFAULT_SECTION_TERM

"""Section semester-length (half-semester) conflict helpers."""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, Optional, Set, Tuple

VALID_SECTION_TERMS = ("full", "half_any", "first_half", "second_half")
DEFAULT_SECTION_TERM = "full"

TERM_FULL = "full"
TERM_HALF_ANY = "half_any"
TERM_FIRST_HALF = "first_half"
TERM_SECOND_HALF = "second_half"

_HALF_TERMS = frozenset({TERM_FIRST_HALF, TERM_SECOND_HALF})

_SEMESTER_LENGTH_ALIASES = {
    "full": TERM_FULL,
    "full semester": TERM_FULL,
    "half any": TERM_HALF_ANY,
    "half (any)": TERM_HALF_ANY,
    "half": TERM_HALF_ANY,
    "any": TERM_HALF_ANY,
    "first half": TERM_FIRST_HALF,
    "1st half": TERM_FIRST_HALF,
    "first": TERM_FIRST_HALF,
    "h1": TERM_FIRST_HALF,
    "second half": TERM_SECOND_HALF,
    "2nd half": TERM_SECOND_HALF,
    "second": TERM_SECOND_HALF,
    "h2": TERM_SECOND_HALF,
}


def normalize_section_term(value: Any) -> str:
    """Normalize a semester_length value to a valid term string."""
    value = re.sub(r"[_-]+", " ", str(value or "").strip().lower())
    value = re.sub(r"\s+", " ", value)
    if not value:
        return DEFAULT_SECTION_TERM
    return _SEMESTER_LENGTH_ALIASES.get(value, DEFAULT_SECTION_TERM if value not in VALID_SECTION_TERMS else value)


def session_to_term(session: str, meeting_dates: str = "") -> str:
    """Map registrar Session (and optional Meeting Dates) to a semester_length value."""
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


def resolve_half_any_half(
    term: Any,
    assigned_half: Any = None,
    occupied_halves: Optional[Iterable[str]] = None,
) -> Optional[str]:
    """Resolve half_any to the open half in a slot, or None when both halves are taken."""
    normalized = normalize_section_term(term)
    if normalized != TERM_HALF_ANY:
        return None
    explicit = normalize_assigned_half(assigned_half)
    if explicit:
        return explicit
    occupied: Set[str] = {
        half for half in (occupied_halves or []) if half in _HALF_TERMS
    }
    if TERM_FIRST_HALF not in occupied:
        return TERM_FIRST_HALF
    if TERM_SECOND_HALF not in occupied:
        return TERM_SECOND_HALF
    return None


def resolve_all_halves_in_slot(occupants: list[dict]) -> Dict[str, str]:
    """Deterministically resolve every half_any occupant in a room/slot."""
    sorted_occupants = sorted(occupants, key=lambda o: str(o.get("section_id") or ""))
    occupied: Set[str] = set()
    resolved: Dict[str, str] = {}

    for occupant in sorted_occupants:
        section_id = str(occupant.get("section_id") or "").strip()
        term = occupant.get("semester_length")
        normalized = normalize_section_term(term)
        if normalized in (TERM_FIRST_HALF, TERM_SECOND_HALF):
            if section_id:
                resolved[section_id] = normalized
            occupied.add(normalized)
            continue
        if normalized != TERM_HALF_ANY or not section_id:
            continue
        half = resolve_half_any_half(
            term,
            occupant.get("assigned_half"),
            occupied,
        )
        if not half:
            continue
        resolved[section_id] = half
        occupied.add(half)

    return resolved


def display_term_group(
    term: Any,
    assigned_half: Any = None,
    occupied_halves: Optional[Iterable[str]] = None,
) -> Optional[str]:
    """Like effective_term_group but never returns half_any."""
    normalized = normalize_section_term(term)
    if normalized == TERM_FULL:
        return TERM_FULL
    if normalized in (TERM_FIRST_HALF, TERM_SECOND_HALF):
        return normalized
    if normalized == TERM_HALF_ANY:
        return resolve_half_any_half(term, assigned_half, occupied_halves or [])
    return TERM_FULL


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

    if group_a == TERM_HALF_ANY and group_b == TERM_HALF_ANY:
        group_a = TERM_FIRST_HALF
        group_b = TERM_SECOND_HALF
    elif group_a == TERM_HALF_ANY:
        occupied = [group_b] if group_b in _HALF_TERMS else []
        resolved = resolve_half_any_half(term_a, assigned_half_a, occupied)
        if not resolved:
            return True
        group_a = resolved
    elif group_b == TERM_HALF_ANY:
        occupied = [group_a] if group_a in _HALF_TERMS else []
        resolved = resolve_half_any_half(term_b, assigned_half_b, occupied)
        if not resolved:
            return True
        group_b = resolved

    if group_a == TERM_FULL or group_b == TERM_FULL:
        return True
    return group_a == group_b


def slot_has_term_conflict(occupants: list[dict]) -> bool:
    """Slot-aware term conflict check for placement (includes the moving section)."""
    resolved = resolve_all_halves_in_slot(occupants)
    full = 0
    first_half = 0
    second_half = 0

    for occupant in occupants:
        normalized = normalize_section_term(occupant.get("semester_length"))
        if normalized == TERM_FULL:
            full += 1
            continue
        if normalized == TERM_FIRST_HALF:
            first_half += 1
            continue
        if normalized == TERM_SECOND_HALF:
            second_half += 1
            continue
        if normalized == TERM_HALF_ANY:
            section_id = str(occupant.get("section_id") or "").strip()
            half = resolved.get(section_id)
            if not half:
                return True
            if half == TERM_FIRST_HALF:
                first_half += 1
            else:
                second_half += 1

    if full > 1:
        return True
    if first_half > 1:
        return True
    if second_half > 1:
        return True
    if full > 0 and (first_half > 0 or second_half > 0):
        return True
    return False


def term_from_mbap_tags(tags: list[str] | None) -> Optional[str]:
    """Infer semester_length from legacy half-1/half-2 MBAP tags when column is missing."""
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
    """Resolve semester_length from section dict, falling back to MBAP tags then default."""
    explicit = section.get("semester_length")
    if explicit is not None and str(explicit).strip():
        return normalize_section_term(explicit)
    from_tags = term_from_mbap_tags(section.get("tags"))
    if from_tags:
        return from_tags
    return DEFAULT_SECTION_TERM

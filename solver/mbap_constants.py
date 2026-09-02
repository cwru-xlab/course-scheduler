"""Stable MBAP timeslot and meeting-pattern IDs (mirrored in platform/lib/scheduling/mbapConstants.ts)."""

from __future__ import annotations

from typing import Any

from section_term import session_to_term

MBAP_TAG = "mbap"
MBAP_HALF_1_TAG = "half-1"
MBAP_HALF_2_TAG = "half-2"

MBAP_TS_MON_615 = "Mon_1815_1945"
MBAP_TS_MON_800 = "Mon_2000_2130"
MBAP_TS_TUE_EVE = "Tue_1800_2100"
MBAP_TS_WED_EVE = "Wed_1800_2100"

MBAP_PATTERN_MON_615 = "mbap_mon_615"
MBAP_PATTERN_MON_800 = "mbap_mon_800"
MBAP_PATTERN_TUE_EVE = "mbap_tue_eve"
MBAP_PATTERN_WED_EVE = "mbap_wed_eve"

MBAP_TIMESLOTS: list[dict[str, Any]] = [
    {"id": MBAP_TS_MON_615, "day": "Mon", "start_time": "18:15", "end_time": "19:45", "slot_type": "evening"},
    {"id": MBAP_TS_MON_800, "day": "Mon", "start_time": "20:00", "end_time": "21:30", "slot_type": "evening"},
    {"id": MBAP_TS_TUE_EVE, "day": "Tue", "start_time": "18:00", "end_time": "21:00", "slot_type": "evening"},
    {"id": MBAP_TS_WED_EVE, "day": "Wed", "start_time": "18:00", "end_time": "21:00", "slot_type": "evening"},
]

MBAP_MEETING_PATTERNS: list[dict[str, Any]] = [
    {
        "id": MBAP_PATTERN_MON_615,
        "slots_required": 1,
        "allowed_days": ["Mon"],
        "compatible_timeslot_sets": [[MBAP_TS_MON_615]],
    },
    {
        "id": MBAP_PATTERN_MON_800,
        "slots_required": 1,
        "allowed_days": ["Mon"],
        "compatible_timeslot_sets": [[MBAP_TS_MON_800]],
    },
    {
        "id": MBAP_PATTERN_TUE_EVE,
        "slots_required": 1,
        "allowed_days": ["Tue"],
        "compatible_timeslot_sets": [[MBAP_TS_TUE_EVE]],
    },
    {
        "id": MBAP_PATTERN_WED_EVE,
        "slots_required": 1,
        "allowed_days": ["Wed"],
        "compatible_timeslot_sets": [[MBAP_TS_WED_EVE]],
    },
]

MBAP_ON_CAMPUS_PATTERNS = [MBAP_PATTERN_MON_615, MBAP_PATTERN_MON_800]
MBAP_ONLINE_PATTERNS = [MBAP_PATTERN_TUE_EVE, MBAP_PATTERN_WED_EVE]


def is_mbap_course(subject: str, course_id: str) -> bool:
    subj = (subject or "").strip().upper()
    cid = (course_id or "").strip().upper()
    return subj == "MBAP" or cid.startswith("MBAP")


def session_half_tags(session: str) -> list[str]:
    """Map registrar Session values to half-semester tags (informational only)."""
    raw = (session or "").strip().lower()
    if not raw:
        return []
    if "sess1" in raw or "half 1" in raw or raw.startswith("half1"):
        return [MBAP_HALF_1_TAG]
    if "sess2" in raw or "half 2" in raw or "reg 2 half" in raw or raw.startswith("half2"):
        return [MBAP_HALF_2_TAG]
    return []


def merge_mbap_catalog(
    timeslot_id_to_timeslot: dict[str, dict],
    pattern_key_to_pattern: dict[str, dict],
) -> None:
    """Ensure MBAP timeslots and patterns exist in import accumulators."""
    for ts in MBAP_TIMESLOTS:
        timeslot_id_to_timeslot.setdefault(ts["id"], ts)
    for pattern in MBAP_MEETING_PATTERNS:
        pattern_key_to_pattern.setdefault(pattern["id"], pattern)


def mbap_allowed_patterns(section_number: str) -> list[str] | None:
    """Return MBAP pattern IDs for a section number, or None if not MBAP-numbered."""
    raw = (section_number or "").strip()
    if not raw.isdigit():
        return None
    num = int(raw)
    if num == 400:
        return list(MBAP_ON_CAMPUS_PATTERNS)
    if 800 <= num <= 899:
        return list(MBAP_ONLINE_PATTERNS)
    return None


def apply_mbap_section_metadata(section: dict, subject: str, session: str) -> list[str]:
    """
    Tag MBAP sections and restrict allowed_meeting_patterns when applicable.
    Returns warning strings for gaps report.
    """
    warnings: list[str] = []
    course_id = str(section.get("course_id") or "")
    if not is_mbap_course(subject, course_id):
        return warnings

    tags = list(section.get("tags") or [])
    if MBAP_TAG not in tags:
        tags.append(MBAP_TAG)
    semester_length = session_to_term(session)
    if semester_length != "full":
        section["semester_length"] = semester_length
    else:
        for half_tag in session_half_tags(session):
            if half_tag not in tags:
                tags.append(half_tag)
    section["tags"] = tags

    section_number = str(section.get("section_number") or "").strip()
    patterns = mbap_allowed_patterns(section_number)
    if patterns:
        section["allowed_meeting_patterns"] = patterns
    elif section_number:
        warnings.append(
            f"MBAP section {section.get('id')} has section_number {section_number!r} "
            "outside 400 / 800–899; allowed_meeting_patterns not preset."
        )
    else:
        warnings.append(
            f"MBAP section {section.get('id')} missing section_number; "
            "allowed_meeting_patterns not preset."
        )
    return warnings

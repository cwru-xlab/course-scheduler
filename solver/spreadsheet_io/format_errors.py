"""User-facing parse error messages with spreadsheet format guidance."""

from __future__ import annotations

EXAMPLE_SPREADSHEET_NAME = "example-format-spreadsheet.xlsx"

FORMAT_REFERENCE = (
    f"Compare your file to {EXAMPLE_SPREADSHEET_NAME}: use the same sheet names "
    "(Sections, Instructors, Rooms, Timeslots, MeetingPatterns, CrosslistGroups, "
    "NoOverlapGroups, BlockedTimes, LockedAssignments, SoftLocks), exact column headers, "
    "and delimiter rules (; for lists, | for nested timeslot sets)."
)

REQUIRED_SHEETS = [
    "Sections",
    "Instructors",
    "Rooms",
    "Timeslots",
    "MeetingPatterns",
    "CrosslistGroups",
    "NoOverlapGroups",
    "BlockedTimes",
    "LockedAssignments",
    "SoftLocks",
]


def format_import_parse_error(exc: Exception) -> str:
    detail = str(exc).strip()
    lowered = detail.lower()

    if "missing required sheet" in lowered:
        return f"{detail} Required sheets: {', '.join(REQUIRED_SHEETS)}. {FORMAT_REFERENCE}"

    if "invalid headers" in lowered:
        return f"{detail} {FORMAT_REFERENCE}"

    if "missing required value" in lowered or "is empty" in lowered:
        return f"{detail} {FORMAT_REFERENCE}"

    if "failed to parse scheduling spreadsheet" in lowered:
        return f"{detail} {FORMAT_REFERENCE}"

    return f"Failed to parse scheduling spreadsheet: {detail} {FORMAT_REFERENCE}"

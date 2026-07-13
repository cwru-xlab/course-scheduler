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


def format_import_parse_error(exc: Exception) -> dict[str, str]:
    """Return a user-facing message and optional technical detail (never mix raw exc into message)."""
    detail = str(exc).strip()
    lowered = detail.lower()

    if any(
        token in lowered
        for token in ("not a zip", "bad zip", "invalid zip", "corrupt", "zip file", "bad magic")
    ):
        return {
            "message": (
                "This file isn't a readable Excel workbook. "
                "Open it in Excel or Google Sheets and re-save it as .xlsx, then try again."
            ),
            "detail": detail or type(exc).__name__,
        }

    if "missing required sheet" in lowered:
        return {
            "message": (
                f"A required sheet is missing. Required sheets: {', '.join(REQUIRED_SHEETS)}. "
                f"{FORMAT_REFERENCE}"
            ),
            "detail": detail,
        }

    if "invalid headers" in lowered:
        return {
            "message": (
                "One or more sheets have column headers that don't match the expected format. "
                f"{FORMAT_REFERENCE}"
            ),
            "detail": detail,
        }

    if "missing required value" in lowered or "is empty" in lowered:
        return {
            "message": (
                "A required cell is empty or missing. Fill in the highlighted field and try again. "
                f"{FORMAT_REFERENCE}"
            ),
            "detail": detail,
        }

    if "failed to parse scheduling spreadsheet" in lowered:
        return {
            "message": f"Could not read your scheduling spreadsheet. {FORMAT_REFERENCE}",
            "detail": detail,
        }

    return {
        "message": f"Could not read your scheduling spreadsheet. {FORMAT_REFERENCE}",
        "detail": detail or type(exc).__name__,
    }

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Tuple

from excel_importer import ParsedData, default_timeslots, parse_excel_to_dicts


def normalize_id(value: Any, fallback: str = "unknown") -> str:
    """
    Normalize a cell value into a stable identifier string.

    Mirrors the behavior of convert._normalize_id so that IDs generated
    from names (rooms, instructors, courses) stay consistent across tools.
    """
    import re

    if value is None:
        return fallback
    if not isinstance(value, str):
        value = str(value)
    s = value.strip()
    if not s:
        return fallback
    normalized = re.sub(r"[\s,]+", "_", s).strip("_")
    return normalized or fallback


def build_parsed_data_from_excel(excel_bytes: bytes) -> ParsedData:
    """
    High-level entrypoint: parse an uploaded Excel file into ParsedData and
    run a light enrichment pass so downstream consumers (SchedulingInput,
    solver) see consistent IDs and reasonable defaults.
    """
    parsed = parse_excel_to_dicts(excel_bytes)
    _enrich_parsed_data(parsed)
    return parsed


def build_scheduling_input_from_parsed(parsed: ParsedData) -> Dict[str, Any]:
    """
    Build a SchedulingInput-compatible dict from ParsedData after enrichment.
    """
    _enrich_parsed_data(parsed)
    return parsed.to_scheduling_input()


def _enrich_parsed_data(parsed: ParsedData) -> None:
    """
    Mutate ParsedData in place to:
    - ensure timeslots exist (fall back to default grid if empty)
    - backfill simple meeting patterns when missing
    - populate allowed_meeting_patterns on sections when obvious
    - normalize IDs for instructors and rooms when they are missing/blank
    """
    # Ensure we have some timeslots at all; if the workbook did not define any,
    # seed from the canonical grid used elsewhere in the app.
    if not parsed.timeslots:
        parsed.timeslots = default_timeslots()

    # Normalize instructor and room IDs if necessary.
    for inst in parsed.instructors:
        inst_id = str(inst.get("id", "")).strip()
        if not inst_id:
            name = inst.get("name") or ""
            inst["id"] = normalize_id(name or "instructor")

    for room in parsed.rooms:
        room_id = str(room.get("id", "")).strip()
        if not room_id:
            building = str(room.get("building") or "").strip()
            room_number = str(room.get("room_number") or "").strip()
            base = f"{building}_{room_number}".strip("_") or "room"
            room["id"] = normalize_id(base)

    # If there are already meeting_patterns defined, assume the workbook is
    # explicitly controlling them and do not override.
    if parsed.meeting_patterns:
        return

    # Otherwise, build a minimal set of meeting patterns from section.timeslot_id.
    # Each distinct timeslot_id becomes its own simple pattern.
    timeslot_by_id: Dict[str, Dict[str, Any]] = {
        str(t["id"]): t for t in parsed.timeslots if "id" in t
    }

    used_timeslot_ids: set[str] = set()
    for section in parsed.sections:
        ts_id = section.get("timeslot_id")
        if ts_id is None:
            continue
        used_timeslot_ids.add(str(ts_id))

    meeting_patterns: List[Dict[str, Any]] = []
    for ts_id in sorted(used_timeslot_ids):
        slot = timeslot_by_id.get(str(ts_id))
        if not slot:
            continue
        # Excel importer uses "days"; JSON solver expects this to be accessible
        # while building allowed_days.
        days_value = slot.get("days") or slot.get("day") or ""
        if isinstance(days_value, str):
            allowed_days: List[str] = list(days_value)
        else:
            allowed_days = []
        meeting_patterns.append(
            {
                "id": str(ts_id),
                "slots_required": 1,
                "allowed_days": allowed_days,
                "compatible_timeslot_sets": [[str(ts_id)]],
            }
        )

    parsed.meeting_patterns = meeting_patterns

    # Ensure each section references a reasonable allowed_meeting_patterns set.
    for section in parsed.sections:
        allowed = section.get("allowed_meeting_patterns")
        if allowed:
            continue
        ts_id = section.get("timeslot_id")
        if ts_id is not None and str(ts_id) in used_timeslot_ids:
            section["allowed_meeting_patterns"] = [str(ts_id)]

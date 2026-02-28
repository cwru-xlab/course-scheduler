"""
Convert xlsx input files to SchedulingInput JSON for solver app.py.
Run from convert-spreadsheet: python convert.py [output_label] [--limit N]

Output: output/scheduling_input_<label>.json (default label: spring2026)

Demo mode: use --limit N to convert only the first N data rows (useful for testing).
Example: python convert.py demo --limit 20
"""
import argparse
import json
import re
import sys
from pathlib import Path

import openpyxl

from config import (
    INPUT_DIR,
    OUTPUT_DIR,
    SECTIONS_SOURCE,
    DEFAULT_ROOM_REQUIREMENTS,
    DEFAULT_TAGS,
)


def _normalize_id(s: str) -> str:
    """Replace spaces and commas with underscores for use as id."""
    if s is None or not isinstance(s, str):
        return ""
    return re.sub(r"[\s,]+", "_", str(s).strip()).strip("_") or "unknown"


def _parse_time_range(s: str) -> tuple[str, str] | None:
    """Parse '6:00 PM-8:30 PM' or '9:00 AM-10:15 AM' -> ('18:00', '20:30')."""
    if not s or not isinstance(s, str):
        return None
    s = s.strip()
    # Match "H:MM AM/PM - H:MM AM/PM" or "H:MM AM/PM-H:MM AM/PM"
    m = re.match(
        r"(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)",
        s,
        re.IGNORECASE,
    )
    if not m:
        return None
    h1, mn1, ap1, h2, mn2, ap2 = m.groups()
    h1, mn1, h2, mn2 = int(h1), int(mn1), int(h2), int(mn2)
    if ap1.upper() == "PM" and h1 != 12:
        h1 += 12
    if ap1.upper() == "AM" and h1 == 12:
        h1 = 0
    if ap2.upper() == "PM" and h2 != 12:
        h2 += 12
    if ap2.upper() == "AM" and h2 == 12:
        h2 = 0
    return (f"{h1:02d}:{mn1:02d}", f"{h2:02d}:{mn2:02d}")


def _parse_days(s: str) -> list[str]:
    """Parse 'Mon Wed ' or 'Mon' -> ['Mon', 'Wed']."""
    if not s or not isinstance(s, str):
        return []
    days = []
    for part in s.strip().split():
        part = part.strip()
        if part and len(part) >= 2:
            days.append(part)
    return days


# SOC day code -> solver day name
_SOC_DAY_MAP = {
    "M": "Mon",
    "Tu": "Tue",
    "T": "Tue",  # some exports use T for Tuesday
    "W": "Wed",
    "Th": "Thu",
    "R": "Thu",  # some exports use R for Thursday
    "F": "Fri",
    "Sa": "Sat",
    "S": "Sat",
    "Su": "Sun",
}


def _parse_days_and_times(s: str) -> tuple[list[str], str]:
    """
    Parse SOC-style combined 'Days and Times' e.g. 'MW 9:00AM - 10:15AM'.
    Returns (days_list, times_str) for use with _parse_days and _parse_time_range.
    """
    if not s or not isinstance(s, str):
        return [], ""
    s = s.strip()
    if s.upper() == "TBA":
        return [], ""
    # Match day codes (M, Tu, W, Th, F, Sa, Su or combos) followed by time range
    m = re.match(
        r"^([MTWRFSSatuwh]+)\s+(.+)$",
        s,
        re.IGNORECASE,
    )
    if not m:
        return [], ""
    day_part, times_part = m.group(1).strip(), m.group(2).strip()
    # Parse day codes: try 2-char first (Tu, Th, Sa, Su), then 1-char (M, W, F, T, R, S)
    days: list[str] = []
    i = 0
    while i < len(day_part):
        two = day_part[i : i + 2] if i + 2 <= len(day_part) else ""
        one = day_part[i]
        if two in _SOC_DAY_MAP:
            days.append(_SOC_DAY_MAP[two])
            i += 2
        elif one in _SOC_DAY_MAP:
            days.append(_SOC_DAY_MAP[one])
            i += 1
        else:
            i += 1
    return days, times_part


def _extract_class_nbr_from_section(section_val) -> str | None:
    """Extract class number from SOC Section e.g. '100-LEC(1293)' -> '1293'."""
    if section_val is None:
        return None
    s = str(section_val).strip()
    m = re.search(r"\((\d+)\)", s)
    return m.group(1) if m else None


def _parse_room_and_capacity(s: str) -> tuple[str, int | None]:
    """
    Parse 'Room (Capacity)' e.g. 'Peter B Lewis 201 (72)' -> ('Peter B Lewis 201', 72).
    Handles 'Online-Asynchronous (250)', 'To Be Announced'.
    """
    if not s or not isinstance(s, str):
        return "TBA", None
    s = s.strip()
    if not s or s.upper() == "TO BE ANNOUNCED":
        return "TBA", None
    m = re.match(r"^(.+?)\s*\((\d+)\)\s*$", s)
    if m:
        return m.group(1).strip(), int(m.group(2))
    return s, None


def _parse_enrollment_val(val) -> int:
    """Parse enrollment cap/total; handles '35 (38)' by taking first number."""
    if val is None:
        return 0
    s = str(val).strip()
    m = re.match(r"^(\d+)", s)
    return int(m.group(1)) if m else 0


def _cell_value(ws, row: int, col: int):
    c = ws.cell(row=row, column=col)
    return c.value


def _read_sheet_with_headers(
    path: Path,
    sheet_name: str,
    header_row: int,
    data_start: int,
    max_column: int | None = None,
):
    """Return (list of column names in order, list of row dicts)."""
    # Use read_only=False when max_column is set; read_only sheets can truncate columns
    use_read_only = max_column is None
    wb = openpyxl.load_workbook(path, read_only=use_read_only, data_only=True)
    ws = wb[sheet_name]
    # read_only sheets may not report dimensions; pass max_column explicitly for SOC
    kwargs = {"min_row": header_row, "max_row": header_row, "values_only": True}
    if max_column is not None:
        kwargs["max_col"] = max_column  # openpyxl uses max_col
    header_cells = next(ws.iter_rows(**kwargs))
    headers = [(i + 1, (str(v).strip().replace("\n", " ").strip() if v is not None else "")) for i, v in enumerate(header_cells)]
    headers = [(col, (name or None)) for col, name in headers]
    while headers and headers[-1][1] is None:
        headers.pop()
    rows = []
    row_kwargs = {"min_row": data_start, "values_only": True}
    if max_column is not None:
        row_kwargs["max_col"] = max_column
    for row in ws.iter_rows(**row_kwargs):
        row_dict = {}
        for (col, name), val in zip(headers, row):
            if name:
                row_dict[name] = val
        rows.append(row_dict)
    wb.close()
    return [name for _, name in headers if name], rows


def _build_timeslot_id(day: str, start: str, end: str) -> str:
    return f"{day}_{start}_{end}".replace(":", "")


# Day order for consistent pattern IDs (Mon before Tue before Wed ...)
_DAY_ORDER = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def _sort_slot_ids_by_day_order(slot_ids: list[str]) -> list[str]:
    """Sort slot IDs by day-of-week order (Mon, Tue, Wed, ...) for consistent pattern format."""
    def day_rank(slot_id: str) -> int:
        for i, day in enumerate(_DAY_ORDER):
            if slot_id.startswith(day + "_"):
                return i
        return 999
    return sorted(slot_ids, key=day_rank)


def load_sections_from_sis(max_rows: int | None = None) -> tuple[list[dict], list[dict], list[dict], list[dict], list[dict]]:
    """
    Load SIS Schedule and return (sections, instructors, rooms, timeslots, meeting_patterns)
    as lists of dicts matching app.py Pydantic models.

    If max_rows is set, process only the first max_rows data rows (for demo/small datasets).
    """
    path = INPUT_DIR / SECTIONS_SOURCE["file"]
    if not path.exists():
        return [], [], [], [], []

    max_col = SECTIONS_SOURCE.get("max_column")
    _, rows = _read_sheet_with_headers(
        path,
        SECTIONS_SOURCE["sheet"],
        SECTIONS_SOURCE["header_row"],
        SECTIONS_SOURCE["data_start_row"],
        max_column=max_col,
    )
    if max_rows is not None:
        rows = rows[:max_rows]

    # Collect unique entities
    timeslot_id_to_timeslot: dict[str, dict] = {}
    pattern_key_to_pattern: dict[str, dict] = {}
    room_name_to_room: dict[str, dict] = {}
    instr_name_to_instructor: dict[str, dict] = {}

    sections: list[dict] = []

    for row in rows:
        # Parse meeting pattern info (days/times). Support both SIS (separate columns)
        # and SOC (combined "Days and Times").
        days_str = row.get("CLASS_MTG_DAYS") or row.get("days") or ""
        times_str = row.get("CW_CLASS_MTG_TIMES") or row.get("times") or ""
        days_and_times = row.get("Days and Times") or ""
        if days_and_times:
            days, times_str = _parse_days_and_times(days_and_times)
        else:
            days = _parse_days(days_str)
        time_range = _parse_time_range(times_str)

        pattern_id: str | None = None
        if days and time_range:
            start_time, end_time = time_range
            pattern_slot_ids: list[str] = []
            for day in days:
                slot_id = _build_timeslot_id(day, start_time, end_time)
                pattern_slot_ids.append(slot_id)
                if slot_id not in timeslot_id_to_timeslot:
                    timeslot_id_to_timeslot[slot_id] = {
                        "id": slot_id,
                        "day": day,
                        "start_time": start_time,
                        "end_time": end_time,
                    }
            ordered_slots = _sort_slot_ids_by_day_order(pattern_slot_ids)
            # Consistent format: always "slot1|slot2|..." (trailing pipe for uniformity)
            pattern_key = "|".join(ordered_slots) + "|"
            if pattern_key not in pattern_key_to_pattern:
                pattern_key_to_pattern[pattern_key] = {
                    "id": _normalize_id(pattern_key) or "default",
                    "slots_required": len(pattern_slot_ids),
                    "allowed_days": list(days),
                    "compatible_timeslot_sets": [pattern_slot_ids],
                }
            pattern_id = pattern_key_to_pattern[pattern_key]["id"]

        room_raw = row.get("CW_MEETING_ROOM") or row.get("Room (Capacity)") or row.get("room") or "TBA"
        room_str, room_cap_from_col = _parse_room_and_capacity(
            room_raw if isinstance(room_raw, str) else str(room_raw or "")
        )
        if not room_str or room_str.upper() == "TO BE ANNOUNCED":
            room_str = "TBA"
        if room_str not in room_name_to_room:
            cap_val = room_cap_from_col or row.get("ENRL_CAP") or row.get("Enrl Cap (Cmbnd Enrl Cap)") or row.get("enrollment_cap")
            try:
                cap = int(float(cap_val)) if cap_val is not None else 50
            except (TypeError, ValueError):
                cap = 50
            room_id = _normalize_id(room_str) or "TBA"
            room_name_to_room[room_str] = {
                "id": room_id,
                "building": room_str,
                "capacity": max(cap, 10),
                "features": [],
            }

        instr_raw = row.get("INSTR_NAME") or row.get("Instructor(s)") or row.get("Instructor") or row.get("instructor_name") or ""
        instr_name = str(instr_raw or "").strip()
        if instr_name and instr_name.upper() != "TO BE ANNOUNCED":
            # Multiple instructors: take first (e.g. "Jackson,Abraham / Carl,Candida" -> "Jackson,Abraham")
            instr_name = instr_name.split("/")[0].split(";")[0].strip()
        if instr_name and instr_name not in instr_name_to_instructor:
            instr_id = _normalize_id(instr_name) or "unknown"
            instr_name_to_instructor[instr_name] = {
                "id": instr_id,
                "rank_type": "Faculty",
                "unavailable_times": [],
                "preferences": {
                    "preferred_days": [],
                    "preferred_patterns": [],
                    "max_teaching_days": None,
                },
            }

        class_nbr = row.get("CLASS_NBR") or row.get("class_nbr")
        if class_nbr is None:
            class_nbr = _extract_class_nbr_from_section(row.get("Section"))
        if class_nbr is None:
            continue
        section_id = str(int(float(class_nbr))) if isinstance(class_nbr, (int, float)) else str(class_nbr).strip()
        subject = (row.get("SUBJECT") or row.get("Subject") or row.get("subject") or "").strip()
        catalog_nbr = (row.get("CATALOG_NBR") or row.get("catalog_nbr") or "").strip()
        if not catalog_nbr:
            # SOC: extract from Description e.g. "ACCT 100 - Foundations..." -> "100"
            desc = (row.get("Description") or "").strip()
            if desc:
                first_part = desc.split(" - ", 1)[0].split()
                catalog_nbr = first_part[-1] if first_part else ""
        course_id = _normalize_id(f"{subject}{catalog_nbr}") or section_id
        section_code = (row.get("CLASS_SECTION") or row.get("Section") or row.get("section_code") or "").strip() or section_id

        enrl_cap = _parse_enrollment_val(
            row.get("ENRL_CAP") or row.get("Enrl Cap (Cmbnd Enrl Cap)") or row.get("enrollment_cap")
        )
        enrl_tot = _parse_enrollment_val(
            row.get("ENRL_TOT") or row.get("Enrl Tot (Cmbnd Enrl Tot)") or row.get("enrollment_total")
        )

        instr_id = _normalize_id(instr_name) if instr_name else "unknown"
        room_id = room_name_to_room[room_str]["id"]

        sections.append({
            "id": section_id,
            "course_id": course_id,
            "section_code": section_code,
            "instructor_id": instr_id,
            "expected_enrollment": enrl_tot,
            "enrollment_cap": enrl_cap,
            # If we know the previous pattern, seed from that; otherwise let the
            # post-processing step below give access to all patterns.
            "allowed_meeting_patterns": [pattern_id] if pattern_id is not None else [],
            "previous_meeting_pattern": pattern_id,
            "room_requirements": DEFAULT_ROOM_REQUIREMENTS.copy(),
            "crosslist_group_id": None,
            "tags": DEFAULT_TAGS.copy(),
        })

    pattern_id_to_slots = {p["id"]: p["slots_required"] for p in pattern_key_to_pattern.values()}
    all_pattern_ids = list(pattern_id_to_slots.keys())
    for s in sections:
        prev_id = s.get("previous_meeting_pattern")
        if prev_id is not None and prev_id in pattern_id_to_slots:
            n_slots = pattern_id_to_slots[prev_id]
            s["allowed_meeting_patterns"] = [
                pid for pid in all_pattern_ids
                if pattern_id_to_slots[pid] == n_slots
            ]
        else:
            s["allowed_meeting_patterns"] = all_pattern_ids

    timeslots = list(timeslot_id_to_timeslot.values())
    meeting_patterns = list(pattern_key_to_pattern.values())
    rooms = list(room_name_to_room.values())
    instructors = list(instr_name_to_instructor.values())

    return sections, instructors, rooms, timeslots, meeting_patterns


def build_scheduling_input(max_rows: int | None = None) -> dict:
    """Build full SchedulingInput dict (valid for app.py ScheduleRequest.input)."""
    sections, instructors, rooms, timeslots, meeting_patterns = load_sections_from_sis(max_rows=max_rows)
    return {
        "sections": sections,
        "instructors": instructors,
        "rooms": rooms,
        "timeslots": timeslots,
        "meeting_patterns": meeting_patterns,
        "crosslist_groups": [],
        "no_overlap_groups": [],
        "blocked_times": [],
        "locked_assignments": [],
        "soft_locks": [],
    }


def validate_with_app(data: dict) -> None:
    """Validate data against app.SchedulingInput if solver app is importable (e.g. when run from solver with uv)."""
    solver_dir = Path(__file__).resolve().parent.parent
    if str(solver_dir) not in sys.path:
        sys.path.insert(0, str(solver_dir))
    try:
        from app import SchedulingInput
        SchedulingInput(**data)
    except ImportError:
        # ortools or other deps not installed in this env; skip validation
        pass
    except Exception as e:
        raise ValueError(f"SchedulingInput validation failed: {e}") from e


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert xlsx input to SchedulingInput JSON for solver.",
        epilog="Example (demo): python convert.py demo --limit 20",
    )
    parser.add_argument(
        "label",
        nargs="?",
        default="spring2026",
        help="Output file label (output/scheduling_input_<label>.json)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Convert only the first N data rows (for demo/test runs)",
    )
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"scheduling_input_{args.label}.json"

    data = build_scheduling_input(max_rows=args.limit)
    validate_with_app(data)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    limit_msg = f" (limited to {args.limit} rows)" if args.limit is not None else ""
    print(f"Wrote {len(data['sections'])} sections, {len(data['instructors'])} instructors, "
          f"{len(data['rooms'])} rooms, {len(data['timeslots'])} timeslots, "
          f"{len(data['meeting_patterns'])} meeting patterns to {out_path}{limit_msg}")


if __name__ == "__main__":
    main()

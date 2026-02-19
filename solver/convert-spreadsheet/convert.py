"""
Convert xlsx input files to SchedulingInput JSON for solver app.py.
Run from convert-spreadsheet: python convert.py [output_label]

Output: output/scheduling_input_<label>.json (default label: spring2026)
"""
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


def _cell_value(ws, row: int, col: int):
    c = ws.cell(row=row, column=col)
    return c.value


def _read_sheet_with_headers(path: Path, sheet_name: str, header_row: int, data_start: int):
    """Return (list of column names in order, list of row dicts)."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet_name]
    # Read header row with iter_rows (read_only sheets may have max_column None)
    header_cells = next(ws.iter_rows(min_row=header_row, max_row=header_row, values_only=True))
    headers = [(i + 1, (str(v).strip().replace("\n", " ").strip() if v is not None else "")) for i, v in enumerate(header_cells)]
    headers = [(col, (name or None)) for col, name in headers]
    while headers and headers[-1][1] is None:
        headers.pop()
    rows = []
    for row in ws.iter_rows(min_row=data_start, values_only=True):
        row_dict = {}
        for (col, name), val in zip(headers, row):
            if name:
                row_dict[name] = val
        rows.append(row_dict)
    wb.close()
    return [name for _, name in headers if name], rows


def _build_timeslot_id(day: str, start: str, end: str) -> str:
    return f"{day}_{start}_{end}".replace(":", "")


def load_sections_from_sis() -> tuple[list[dict], list[dict], list[dict], list[dict], list[dict]]:
    """
    Load SIS Schedule and return (sections, instructors, rooms, timeslots, meeting_patterns)
    as lists of dicts matching app.py Pydantic models.
    """
    path = INPUT_DIR / SECTIONS_SOURCE["file"]
    if not path.exists():
        return [], [], [], [], []

    col_map = SECTIONS_SOURCE["columns"]
    _, rows = _read_sheet_with_headers(
        path,
        SECTIONS_SOURCE["sheet"],
        SECTIONS_SOURCE["header_row"],
        SECTIONS_SOURCE["data_start_row"],
    )

    # Collect unique entities
    timeslot_id_to_timeslot: dict[str, dict] = {}
    pattern_key_to_pattern: dict[str, dict] = {}
    room_name_to_room: dict[str, dict] = {}
    instr_name_to_instructor: dict[str, dict] = {}

    sections: list[dict] = []

    for row in rows:
        days_str = row.get("CLASS_MTG_DAYS") or row.get("days") or ""
        times_str = row.get("CW_CLASS_MTG_TIMES") or row.get("times") or ""
        days = _parse_days(days_str)
        time_range = _parse_time_range(times_str)

        if not days or not time_range:
            continue

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
        pattern_key = "|".join(sorted(pattern_slot_ids))
        if pattern_key not in pattern_key_to_pattern:
            pattern_key_to_pattern[pattern_key] = {
                "id": _normalize_id(pattern_key) or "default",
                "slots_required": len(pattern_slot_ids),
                "allowed_days": list(days),
                "compatible_timeslot_sets": [pattern_slot_ids],
            }

        room_str = (row.get("CW_MEETING_ROOM") or row.get("room") or "TBA").strip()
        if not room_str or room_str.upper() == "TO BE ANNOUNCED":
            room_str = "TBA"
        if room_str not in room_name_to_room:
            cap_val = row.get("ENRL_CAP") or row.get("enrollment_cap")
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

        instr_name = (row.get("INSTR_NAME") or row.get("instructor_name") or "").strip()
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
            continue
        section_id = str(int(float(class_nbr))) if isinstance(class_nbr, (int, float)) else str(class_nbr).strip()
        subject = (row.get("SUBJECT") or row.get("subject") or "").strip()
        catalog_nbr = (row.get("CATALOG_NBR") or row.get("catalog_nbr") or "").strip()
        course_id = _normalize_id(f"{subject}{catalog_nbr}") or section_id
        section_code = (row.get("CLASS_SECTION") or row.get("section_code") or "").strip() or section_id

        try:
            enrl_cap = int(float(row.get("ENRL_CAP") or row.get("enrollment_cap") or 0))
        except (TypeError, ValueError):
            enrl_cap = 0
        try:
            enrl_tot = int(float(row.get("ENRL_TOT") or row.get("enrollment_total") or 0))
        except (TypeError, ValueError):
            enrl_tot = 0

        pattern_id = pattern_key_to_pattern[pattern_key]["id"]
        instr_id = _normalize_id(instr_name) if instr_name else "unknown"
        room_id = room_name_to_room[room_str]["id"]

        sections.append({
            "id": section_id,
            "course_id": course_id,
            "section_code": section_code,
            "instructor_id": instr_id,
            "expected_enrollment": enrl_tot,
            "enrollment_cap": enrl_cap,
            "allowed_meeting_patterns": [pattern_id],
            "room_requirements": DEFAULT_ROOM_REQUIREMENTS.copy(),
            "crosslist_group_id": None,
            "tags": DEFAULT_TAGS.copy(),
        })

    timeslots = list(timeslot_id_to_timeslot.values())
    meeting_patterns = list(pattern_key_to_pattern.values())
    rooms = list(room_name_to_room.values())
    instructors = list(instr_name_to_instructor.values())

    return sections, instructors, rooms, timeslots, meeting_patterns


def build_scheduling_input() -> dict:
    """Build full SchedulingInput dict (valid for app.py ScheduleRequest.input)."""
    sections, instructors, rooms, timeslots, meeting_patterns = load_sections_from_sis()
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
    label = sys.argv[1] if len(sys.argv) > 1 else "spring2026"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"scheduling_input_{label}.json"

    data = build_scheduling_input()
    validate_with_app(data)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(data['sections'])} sections, {len(data['instructors'])} instructors, "
          f"{len(data['rooms'])} rooms, {len(data['timeslots'])} timeslots, "
          f"{len(data['meeting_patterns'])} meeting patterns to {out_path}")


if __name__ == "__main__":
    main()

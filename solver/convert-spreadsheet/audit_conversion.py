"""
Audit the source xlsx spreadsheet against a generated JSON output.

Supports two audit modes determined by the JSON format:
  solver  — audits scheduling_input_*.json (original solver format)
  model   — audits model_input_*.json (platform data model format)

Run from the solver directory so relative paths match:
  cd solver && python convert-spreadsheet/audit_conversion.py [file1.json [file2.json ...]]

If no files are given, audits all scheduling_input_*.json AND model_input_*.json
in convert-spreadsheet/output/.
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Iterable

from config import INPUT_DIR, SECTIONS_SOURCE  # type: ignore[reportMissingImports]
from convert import (  # type: ignore[reportMissingImports]
    _extract_class_nbr_from_section,
    _parse_enrollment_str,
    _parse_enrollment_val,
    _parse_days_and_times,
    _parse_time_range,
    _read_sheet_with_headers,
    load_sections_from_sis,
    detect_format,
    _SOC_EDITORS_COLUMNS,
)

CONVERT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = CONVERT_DIR / "output"


# ============================================================================
# HELPERS
# ============================================================================

def _to_int(val) -> int:
    if val is None:
        return 0
    try:
        return int(val)
    except (TypeError, ValueError):
        try:
            return int(float(val))
        except (TypeError, ValueError):
            return 0


def _normalize_class_nbr(val) -> str | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return str(int(val))
    s = str(val).strip()
    return s or None


def _load_raw_rows() -> tuple[list[dict], str]:
    """
    Load raw rows from the configured source xlsx.
    Returns (rows, detected_format) where format is 'soc_editors' or 'sis'.
    """
    path = INPUT_DIR / SECTIONS_SOURCE["file"]
    if not path.exists():
        raise FileNotFoundError(f"Source file not found: {path}")

    fmt = detect_format(path, SECTIONS_SOURCE["sheet"], SECTIONS_SOURCE["header_row"])
    _, rows = _read_sheet_with_headers(
        path,
        SECTIONS_SOURCE["sheet"],
        SECTIONS_SOURCE["header_row"],
        SECTIONS_SOURCE["data_start_row"],
        max_column=SECTIONS_SOURCE.get("max_column"),
    )
    return rows, fmt


def _detect_json_mode(data: dict) -> str:
    """Return 'model' or 'solver' based on JSON content."""
    if "courses" in data or "_gaps" in data:
        return "model"
    return "solver"


# ============================================================================
# SHARED AUDITS
# ============================================================================

def _audit_record_counts_solver(
    rows: list[dict], json_sections: list[dict]
) -> None:
    """Original solver audit: one JSON section per xlsx row (minus missing CLASS_NBR)."""
    dropped = sum(
        1 for row in rows
        if _extract_class_nbr_from_section(row.get("Section") or row.get("CLASS_NBR") or row.get("class_nbr")) is None
    )
    expected = len(rows) - dropped
    actual = len(json_sections)

    print("Record Count Audit (solver mode)")
    print(f"  Raw rows:              {len(rows)}")
    print(f"  Dropped (no class nbr):{dropped}")
    print(f"  Expected sections:     {expected}")
    print(f"  Actual sections:       {actual}")
    delta = actual - expected
    print(f"  RESULT: {'OK' if delta == 0 else f'MISMATCH (delta={delta})'}")
    print()


def _audit_record_counts_model(
    rows: list[dict], json_sections: list[dict]
) -> None:
    """
    Model audit: JSON sections should equal UNIQUE class numbers in xlsx
    (multi-occurrence rows are collapsed into one section).
    """
    class_nbrs: set[str] = set()
    for row in rows:
        nbr = _extract_class_nbr_from_section(row.get("Section"))
        if nbr:
            class_nbrs.add(nbr)

    expected = len(class_nbrs)
    actual = len(json_sections)
    delta = actual - expected

    print("Record Count Audit (model mode — deduplicated by class number)")
    print(f"  Raw xlsx rows:               {len(rows)}")
    print(f"  Unique class numbers in xlsx:{expected}")
    print(f"  Sections in JSON:            {actual}")
    print(f"  RESULT: {'OK' if delta == 0 else f'MISMATCH (delta={delta})'}")
    print()


# ============================================================================
# ENROLLMENT CHECKSUMS
# ============================================================================

def _audit_enrollment_solver(rows: list[dict], json_sections: list[dict]) -> None:
    raw_cap = sum(_parse_enrollment_val(
        row.get("ENRL_CAP") or row.get("Enrl Cap (Cmbnd Enrl Cap)") or row.get("enrollment_cap")
    ) for row in rows)
    raw_tot = sum(_parse_enrollment_val(
        row.get("ENRL_TOT") or row.get("Enrl Tot (Cmbnd Enrl Tot)") or row.get("enrollment_total")
    ) for row in rows)
    json_cap = sum(_to_int(s.get("enrollment_cap")) for s in json_sections)
    json_tot = sum(_to_int(s.get("expected_enrollment")) for s in json_sections)

    print("Enrollment Checksum Audit (solver mode)")
    print(f"  ENRL_CAP  raw={raw_cap}  json={json_cap}  diff={json_cap - raw_cap}")
    print(f"  ENRL_TOT  raw={raw_tot}  json={json_tot}  diff={json_tot - raw_tot}")
    print()


def _audit_enrollment_model(rows: list[dict], json_sections: list[dict]) -> None:
    """
    Model mode: deduplicate by class number first, then compare section caps.
    Combined cap is separately verified.
    """
    # Deduplicate rows by class number
    class_first: dict[str, dict] = {}
    for row in rows:
        nbr = _extract_class_nbr_from_section(row.get("Section"))
        if nbr and nbr not in class_first:
            class_first[nbr] = row

    raw_sec_cap = sum(
        _parse_enrollment_str(r.get("Enrl Cap (Cmbnd Enrl Cap)"))[0]
        for r in class_first.values()
    )
    raw_cmbnd_cap = sum(
        _parse_enrollment_str(r.get("Enrl Cap (Cmbnd Enrl Cap)"))[1]
        for r in class_first.values()
    )
    json_sec_cap = sum(_to_int(s.get("enrollment_cap")) for s in json_sections)
    json_cmbnd_cap = sum(_to_int(s.get("combined_enrollment_cap")) for s in json_sections)

    print("Enrollment Checksum Audit (model mode)")
    print(f"  Section cap   raw={raw_sec_cap}   json={json_sec_cap}   "
          f"diff={json_sec_cap - raw_sec_cap}")
    print(f"  Combined cap  raw={raw_cmbnd_cap}  json={json_cmbnd_cap}  "
          f"diff={json_cmbnd_cap - raw_cmbnd_cap}")
    note = "NOTE: expected_enrollment is currently set to section_cap (proxy — see _gaps)"
    print(f"  {note}")
    print()


# ============================================================================
# UNIQUE ID COVERAGE
# ============================================================================

def _audit_unique_ids(rows: list[dict], json_sections: list[dict], mode: str) -> None:
    raw_ids: set[str] = set()
    for row in rows:
        nbr = (
            _extract_class_nbr_from_section(row.get("Section"))
            or _normalize_class_nbr(row.get("CLASS_NBR") or row.get("class_nbr"))
        )
        if nbr:
            raw_ids.add(nbr)

    json_ids: set[str] = set()
    for s in json_sections:
        cid = _normalize_class_nbr(s.get("id"))
        if cid:
            json_ids.add(cid)

    missing = sorted(raw_ids - json_ids)
    extra = sorted(json_ids - raw_ids)

    print(f"Unique ID Coverage Audit (class numbers)")
    print(f"  In xlsx:    {len(raw_ids)}")
    print(f"  In JSON:    {len(json_ids)}")
    if missing:
        preview = ", ".join(missing[:20])
        more = f" ... (+{len(missing) - 20} more)" if len(missing) > 20 else ""
        print(f"  ⚠  In xlsx but NOT in JSON: {preview}{more}")
    if extra:
        preview = ", ".join(extra[:20])
        print(f"  ⚠  In JSON but NOT in xlsx: {preview}")
    if not missing and not extra:
        print("  ✓  All class numbers match exactly")
    print()


# ============================================================================
# MODEL-SPECIFIC AUDITS
# ============================================================================

def _audit_courses(rows: list[dict], json_data: dict) -> None:
    """Verify every Subject+Catalog combo in xlsx has a Course entry in JSON."""
    xlsx_courses: set[str] = set()
    for row in rows:
        subject = str(row.get("Subject") or "").strip()
        catalog = str(row.get("Catalog") or "").strip()
        if subject:
            cid = re.sub(r"[\s,]+", "_", f"{subject}{catalog}").strip("_")
            xlsx_courses.add(cid)

    json_courses = {c["id"] for c in json_data.get("courses", [])}
    missing = sorted(xlsx_courses - json_courses)

    print("Course Coverage Audit")
    print(f"  Unique Subject+Catalog in xlsx: {len(xlsx_courses)}")
    print(f"  Course records in JSON:         {len(json_courses)}")
    if missing:
        print(f"  ⚠  Missing course records: {missing[:10]}")
    else:
        print("  ✓  All Subject+Catalog combos represented")
    # Flag unfillable fields
    unfilled = [
        c for c in json_data.get("courses", [])
        if c.get("is_core") is None or c.get("is_new") is None
    ]
    print(f"  Courses with is_core/is_new=None (gap): {len(unfilled)}")
    print()


def _audit_instructors(rows: list[dict], json_data: dict) -> None:
    """Verify instructor coverage and flag Staff/TBD entries."""
    xlsx_instrs: set[str] = set()
    staff_count = 0
    for row in rows:
        instr = str(row.get("Instructor(s)") or "").strip().split("/")[0].strip()
        if instr.lower() == "staff" or not instr:
            staff_count += 1
        else:
            xlsx_instrs.add(instr)

    json_instrs = {i["id"] for i in json_data.get("instructors", [])}
    rank_missing = [
        i for i in json_data.get("instructors", [])
        if i.get("rank_type") is None
    ]

    print("Instructor Coverage Audit")
    print(f"  Named instructors in xlsx: {len(xlsx_instrs)}")
    print(f"  Instructor records in JSON:{len(json_instrs)}")
    print(f"  'Staff TBD' rows:          {staff_count}")
    print(f"  Missing rank_type (gap):   {len(rank_missing)}")
    print()


def _audit_crosslisting(rows: list[dict], json_data: dict) -> None:
    """Cross-check detected cross-list groups."""
    # Recompute signal from xlsx
    class_first: dict[str, dict] = {}
    for row in rows:
        nbr = _extract_class_nbr_from_section(row.get("Section"))
        if nbr and nbr not in class_first:
            class_first[nbr] = row

    from collections import defaultdict
    signal_groups: dict[tuple, list] = defaultdict(list)
    for nbr, row in class_first.items():
        desc = str(row.get("Description") or "").strip()
        instr = str(row.get("Instructor(s)") or "").strip().split("/")[0].strip()
        prev = str(row.get("Previous Semester Days and Times") or "").strip()
        _, cmbnd = _parse_enrollment_str(row.get("Enrl Cap (Cmbnd Enrl Cap)"))
        signal_groups[(desc, instr, prev, cmbnd)].append(nbr)

    expected_groups = sum(1 for v in signal_groups.values() if len(v) > 1)
    expected_xlist_sections = sum(len(v) for v in signal_groups.values() if len(v) > 1)
    json_groups = len(json_data.get("crosslist_groups", []))
    json_xlist_sections = sum(
        len(g.get("member_section_ids", []))
        for g in json_data.get("crosslist_groups", [])
    )

    print("Cross-Listing Audit")
    print(f"  Detected groups (xlsx signal):   {expected_groups} "
          f"({expected_xlist_sections} sections)")
    print(f"  Cross-list groups in JSON:       {json_groups} "
          f"({json_xlist_sections} sections)")
    delta = json_groups - expected_groups
    print(f"  RESULT: {'OK' if delta == 0 else f'MISMATCH (delta={delta})'}")
    print("  NOTE: Cross-listing is heuristic. Manual verification recommended.")
    print()


def _audit_gaps_report(json_data: dict) -> None:
    """Summarize the _gaps report from model JSON."""
    gaps = json_data.get("_gaps", {})
    if not gaps:
        print("No _gaps report found in JSON.")
        return

    summary = gaps.get("summary", {})
    print("Gaps Summary")
    for k, v in summary.items():
        print(f"  {k}: {v}")

    model_gaps = gaps.get("model_fields_not_populated", {})
    print(f"  Model fields with gaps documented: {len(model_gaps)}")

    sheet_gaps = gaps.get("spreadsheet_columns_not_mapped_to_model", {})
    print(f"  Spreadsheet columns not mapped:    {len(sheet_gaps)}")
    print()


def _audit_against_converter_model(json_sections: list[dict]) -> None:
    """Compare JSON section count against a fresh run of load_sections_from_soc_editors."""
    try:
        from convert import load_sections_from_soc_editors
        live_sections, *_ = load_sections_from_soc_editors()
        live_count = len(live_sections)
    except Exception as e:
        print(f"Converter consistency audit skipped: {e}")
        return

    print("Converter Consistency Audit")
    print(f"  Sections from load_sections_from_soc_editors(): {live_count}")
    print(f"  Sections in JSON:                               {len(json_sections)}")
    delta = len(json_sections) - live_count
    print(f"  RESULT: {'OK' if delta == 0 else f'MISMATCH (delta={delta})'}")
    print()


# ============================================================================
# SOLVER AUDITS (original)
# ============================================================================

def _audit_checksums_solver(rows: list[dict], json_sections: list[dict]) -> None:
    _audit_enrollment_solver(rows, json_sections)


def _audit_unique_ids_solver(rows: list[dict], json_sections: list[dict]) -> None:
    _audit_unique_ids(rows, json_sections, mode="solver")


def _audit_against_converter_solver(json_sections: list[dict]) -> None:
    try:
        sections_from_converter, *_ = load_sections_from_sis()
        converter_count = len(sections_from_converter)
    except Exception as e:
        print(f"Converter consistency audit skipped: {e}")
        return

    print("Converter Consistency Audit (solver)")
    print(f"  Sections from load_sections_from_sis(): {converter_count}")
    print(f"  Sections in JSON:                       {len(json_sections)}")
    delta = len(json_sections) - converter_count
    print(f"  RESULT: {'OK' if delta == 0 else f'MISMATCH (delta={delta})'}")
    print()


# ============================================================================
# MAIN AUDIT DISPATCHER
# ============================================================================

def audit_file(path: Path) -> None:
    print(f"\n{'=' * 60}")
    print(f"Auditing: {path.name}")
    print(f"{'=' * 60}")

    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"ERROR: Could not load JSON: {e}")
        return

    json_sections = data.get("sections") or []
    if not isinstance(json_sections, list):
        print("ERROR: JSON 'sections' field is not a list")
        return

    try:
        rows, source_fmt = _load_raw_rows()
    except Exception as e:
        print(f"ERROR: Failed to load source rows: {e}")
        return

    json_mode = _detect_json_mode(data)
    print(f"Source format: {source_fmt}   JSON mode: {json_mode}")
    print()

    if json_mode == "model":
        _audit_record_counts_model(rows, json_sections)
        _audit_enrollment_model(rows, json_sections)
        _audit_unique_ids(rows, json_sections, mode="model")
        _audit_courses(rows, data)
        _audit_instructors(rows, data)
        _audit_crosslisting(rows, data)
        _audit_gaps_report(data)
        _audit_against_converter_model(json_sections)
    else:
        _audit_record_counts_solver(rows, json_sections)
        _audit_checksums_solver(rows, json_sections)
        _audit_unique_ids_solver(rows, json_sections)
        _audit_against_converter_solver(json_sections)


def main() -> None:
    if not OUTPUT_DIR.exists():
        print(f"Output directory not found: {OUTPUT_DIR}")
        sys.exit(1)

    if sys.argv[1:]:
        paths = []
        for p in sys.argv[1:]:
            p = Path(p)
            if not p.is_absolute():
                p = OUTPUT_DIR / p.name
            if not p.exists():
                print(f"File not found: {p}")
                sys.exit(1)
            paths.append(p)
    else:
        # Audit both solver and model outputs if present
        paths = sorted(
            list(OUTPUT_DIR.glob("scheduling_input_*.json"))
            + list(OUTPUT_DIR.glob("model_input_*.json"))
        )

    if not paths:
        print(f"No output JSON files found in {OUTPUT_DIR}")
        sys.exit(1)

    print(f"Auditing {len(paths)} file(s)")
    for path in paths:
        audit_file(path)


if __name__ == "__main__":
    main()

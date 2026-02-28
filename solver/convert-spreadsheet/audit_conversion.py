"""
Audit the SIS Schedule spreadsheet against generated SchedulingInput JSON.

Run from the solver directory so relative paths match:
  cd solver && python convert-spreadsheet/audit_conversion.py [file1.json [file2.json ...]]

If no files are given, audits all scheduling_input_*.json in convert-spreadsheet/output/.
"""

import json
import sys
from pathlib import Path
from typing import Iterable

from config import INPUT_DIR, SECTIONS_SOURCE  # type: ignore[reportMissingImports]
from convert import (  # type: ignore[reportMissingImports]
    _extract_class_nbr_from_section,
    _parse_days,
    _parse_enrollment_val,
    _parse_time_range,
    _read_sheet_with_headers,
    load_sections_from_sis,
)


CONVERT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = CONVERT_DIR / "output"


def _to_int(val) -> int:
    """Best-effort conversion to int, returning 0 on failure."""
    if val is None:
        return 0
    try:
        return int(val)
    except (TypeError, ValueError):
        try:
            return int(float(val))
        except (TypeError, ValueError):
            return 0


def _load_raw_rows() -> list[dict]:
    """Load all raw rows from the configured SIS schedule sheet."""
    path = INPUT_DIR / SECTIONS_SOURCE["file"]
    if not path.exists():
        raise FileNotFoundError(f"SIS schedule file not found: {path}")

    _, rows = _read_sheet_with_headers(
        path,
        SECTIONS_SOURCE["sheet"],
        SECTIONS_SOURCE["header_row"],
        SECTIONS_SOURCE["data_start_row"],
        max_column=SECTIONS_SOURCE.get("max_column"),
    )
    return rows


def _audit_record_counts(rows: list[dict], json_sections: list[dict]) -> None:
    """Compare raw row counts (with intentional filters) to JSON sections."""
    raw_row_count = len(rows)
    dropped_missing_class_nbr = 0

    for row in rows:
        class_nbr = row.get("CLASS_NBR") or row.get("class_nbr")
        if class_nbr is None:
            class_nbr = _extract_class_nbr_from_section(row.get("Section"))

        if class_nbr is None:
            dropped_missing_class_nbr += 1
            continue

    # Converter now keeps rows even if days/times are missing; the only
    # intentional drop is when CLASS_NBR is missing.
    expected_sections = raw_row_count - dropped_missing_class_nbr
    actual_sections = len(json_sections)

    print("Record Count Audit")
    print("  Raw SIS rows:                 ", raw_row_count)
    print("  Intentionally dropped (no CLASS_NBR):", dropped_missing_class_nbr)
    print("  Expected JSON sections:        ", expected_sections)
    print("  Actual JSON sections:          ", actual_sections)

    delta = actual_sections - expected_sections
    if delta == 0:
        print("  RESULT: OK (record counts align after intentional filters)")
    else:
        print(f"  RESULT: MISMATCH (JSON sections differ from expectation by {delta})")
    print()


def _sum_column(rows: Iterable[dict], *keys: str, parse_enrollment: bool = False) -> int:
    """Sum a numeric column from rows, trying alternate keys."""
    total = 0
    for row in rows:
        val = None
        for k in keys:
            if k in row:
                val = row.get(k)
                break
        total += _parse_enrollment_val(val) if parse_enrollment else _to_int(val)
    return total


def _audit_checksums(rows: list[dict], json_sections: list[dict]) -> None:
    """Compare enrollment capacity/total sums between SIS and JSON."""
    raw_cap_sum = _sum_column(
        rows,
        "ENRL_CAP",
        "Enrl Cap (Cmbnd Enrl Cap)",
        "enrollment_cap",
        parse_enrollment=True,
    )
    raw_tot_sum = _sum_column(
        rows,
        "ENRL_TOT",
        "Enrl Tot (Cmbnd Enrl Tot)",
        "enrollment_total",
        parse_enrollment=True,
    )

    json_cap_sum = sum(_to_int(s.get("enrollment_cap")) for s in json_sections)
    json_tot_sum = sum(_to_int(s.get("expected_enrollment")) for s in json_sections)

    print("Checksum Audit (Aggregation)")
    print("  ENRL_CAP (raw SIS):   ", raw_cap_sum)
    print("  ENRL_CAP (JSON):      ", json_cap_sum)
    print("  ENRL_CAP difference:  ", json_cap_sum - raw_cap_sum)
    print("  ENRL_TOT (raw SIS):   ", raw_tot_sum)
    print("  ENRL_TOT (JSON):      ", json_tot_sum)
    print("  ENRL_TOT difference:  ", json_tot_sum - raw_tot_sum)
    print()


def _normalize_class_nbr(val) -> str | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return str(int(val))
    s = str(val).strip()
    return s or None


def _audit_unique_ids(rows: list[dict], json_sections: list[dict]) -> None:
    """Compare CLASS_NBR sets between SIS and JSON."""
    raw_ids_all: set[str] = set()
    raw_ids_candidates: set[str] = set()  # rows that look convertible (have CLASS_NBR)

    for row in rows:
        raw_nbr = row.get("CLASS_NBR") or row.get("class_nbr")
        if raw_nbr is None:
            raw_nbr = _extract_class_nbr_from_section(row.get("Section"))
        cid = _normalize_class_nbr(raw_nbr)

        if cid is not None:
            raw_ids_all.add(cid)
            # Converter now keeps all rows with a CLASS_NBR, even if days/times
            # are missing, so treat every such row as a convertible candidate.
            raw_ids_candidates.add(cid)

    json_ids: set[str] = set()
    for s in json_sections:
        cid = _normalize_class_nbr(s.get("id"))
        if cid is not None:
            json_ids.add(cid)

    missing_from_json_all = sorted(raw_ids_all - json_ids)
    missing_from_json_candidates = sorted(raw_ids_candidates - json_ids)

    print("Unique Identifier Audit (CLASS_NBR)")
    print("  Unique CLASS_NBR in SIS (all):           ", len(raw_ids_all))
    print("  Unique CLASS_NBR in SIS (with days/time):", len(raw_ids_candidates))
    print("  Unique section ids in JSON:              ", len(json_ids))
    print("  Missing from JSON (all SIS):             ", len(missing_from_json_all))
    print("  Missing from JSON (convertible rows):    ", len(missing_from_json_candidates))

    if missing_from_json_candidates:
        preview = ", ".join(missing_from_json_candidates[:20])
        more = "" if len(missing_from_json_candidates) <= 20 else f" ... (+{len(missing_from_json_candidates) - 20} more)"
        print(f"  EXAMPLES (convertible but missing): {preview}{more}")
    elif missing_from_json_all:
        preview = ", ".join(missing_from_json_all[:20])
        more = "" if len(missing_from_json_all) <= 20 else f" ... (+{len(missing_from_json_all) - 20} more)"
        print(f"  NOTE: Only non-convertible rows (no days/time) are missing. Examples: {preview}{more}")
    else:
        print("  RESULT: OK (every SIS CLASS_NBR appears in JSON)")
    print()


def _audit_against_converter(json_sections: list[dict]) -> None:
    """
    Extra sanity check: compare JSON sections to what load_sections_from_sis() produces.

    This helps detect cases where the JSON was edited manually after conversion.
    """
    sections_from_converter, *_ = load_sections_from_sis()
    converter_count = len(sections_from_converter)
    json_count = len(json_sections)

    print("Converter Consistency Audit")
    print("  Sections from load_sections_from_sis():", converter_count)
    print("  Sections in JSON:                      ", json_count)

    delta = json_count - converter_count
    if delta == 0:
        print("  RESULT: OK (JSON matches current converter output size)")
    else:
        print(f"  RESULT: MISMATCH (JSON differs from converter output size by {delta})")
    print()


def audit_file(path: Path) -> None:
    print(f"\n=== Auditing {path.name} ===")
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
        rows = _load_raw_rows()
    except Exception as e:
        print(f"ERROR: Failed to load SIS rows: {e}")
        return

    _audit_record_counts(rows, json_sections)
    _audit_checksums(rows, json_sections)
    _audit_unique_ids(rows, json_sections)
    _audit_against_converter(json_sections)


def main() -> None:
    if not OUTPUT_DIR.exists():
        print(f"Output directory not found: {OUTPUT_DIR}")
        sys.exit(1)

    if sys.argv[1:]:
        paths = [Path(p) for p in sys.argv[1:]]
        resolved: list[Path] = []
        for p in paths:
            if not p.is_absolute():
                p = OUTPUT_DIR / p.name
            if not p.exists():
                print(f"File not found: {p}")
                sys.exit(1)
            resolved.append(p)
        paths = resolved
    else:
        paths = sorted(OUTPUT_DIR.glob("scheduling_input_*.json"))

    if not paths:
        print(f"No scheduling_input_*.json files in {OUTPUT_DIR}")
        sys.exit(1)

    print(f"Auditing {len(paths)} file(s) from {OUTPUT_DIR}")
    for path in paths:
        audit_file(path)


if __name__ == "__main__":
    main()


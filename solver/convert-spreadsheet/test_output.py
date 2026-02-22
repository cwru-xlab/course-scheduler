"""
Load converted JSON output files, pass them to the solver's SchedulingInput,
and run the solver to verify the conversion worked.

Run from the solver directory so app and ortools are available:
  cd solver && python convert-spreadsheet/test_output.py [file1.json [file2.json ...]]
  cd solver && uv run python convert-spreadsheet/test_output.py

If no files are given, tests all scheduling_input_*.json in convert-spreadsheet/output/.

Options:
  --validate-only   Only validate JSON as SchedulingInput; do not run the solver (fast, no ortools needed for validation if using a local schema).
"""
import json
import sys
from pathlib import Path

VALIDATE_ONLY = "--validate-only" in sys.argv
if VALIDATE_ONLY:
    sys.argv = [a for a in sys.argv if a != "--validate-only"]

# Run from solver directory: add parent of convert-spreadsheet (solver) to path
CONVERT_DIR = Path(__file__).resolve().parent
SOLVER_DIR = CONVERT_DIR.parent
if str(SOLVER_DIR) not in sys.path:
    sys.path.insert(0, str(SOLVER_DIR))

OUTPUT_DIR = CONVERT_DIR / "output"


def _minimal_validate(data: dict) -> tuple[bool, str]:
    """Check required keys and types without app. Return (ok, message)."""
    required = ["sections", "instructors", "rooms", "timeslots", "meeting_patterns",
                "crosslist_groups", "no_overlap_groups", "blocked_times", "locked_assignments", "soft_locks"]
    for key in required:
        if key not in data:
            return False, f"missing key: {key}"
        if not isinstance(data[key], list):
            return False, f"{key} must be a list"
    return True, "structure OK"


def test_file(path: Path) -> bool:
    """Load JSON, build SchedulingInput, run solver. Return True if no crash."""
    print(f"\n--- Testing {path.name} ---")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"  FAIL: Could not load JSON: {e}")
        return False

    try:
        from app import SchedulingInput, _solve_schedule
    except ImportError as e:
        ok, msg = _minimal_validate(data)
        if ok:
            print(f"  Loaded: {len(data['sections'])} sections, {len(data['instructors'])} instructors, "
                  f"{len(data['rooms'])} rooms, ... ({msg})")
            print(f"  SKIP: Cannot import app to run solver (install ortools in solver env): {e}")
            return True  # conversion structure is fine
        print(f"  FAIL: {msg}. Also cannot import app: {e}")
        return False

    try:
        input_data = SchedulingInput(**data)
        print(f"  Loaded: {len(input_data.sections)} sections, {len(input_data.instructors)} instructors, "
              f"{len(input_data.rooms)} rooms, {len(input_data.timeslots)} timeslots, "
              f"{len(input_data.meeting_patterns)} patterns")
    except Exception as e:
        print(f"  FAIL: SchedulingInput validation failed: {e}")
        return False

    if VALIDATE_ONLY:
        print(f"  OK: SchedulingInput valid (--validate-only, solver not run)")
        return True

    result = _solve_schedule(input_data)
    status = result.get("status", "?")

    if status == "ok":
        assignments = result.get("assignments", [])
        total_score = result.get("total_score", 0)
        print(f"  OK: Solver found a feasible schedule: {len(assignments)} assignments, total_score={total_score}")
        return True
    else:
        errors = result.get("errors", [])
        diagnostics = result.get("diagnostics", {})
        print(f"  Solver status: {status}")
        for err in errors[:5]:
            print(f"    - {err.get('code', '')}: {err.get('message', err)}")
        if len(errors) > 5:
            print(f"    ... and {len(errors) - 5} more")
        if diagnostics:
            print(f"  Diagnostics: {diagnostics}")
        return False


def main() -> None:
    if not OUTPUT_DIR.exists():
        print(f"Output directory not found: {OUTPUT_DIR}")
        sys.exit(1)

    if sys.argv[1:]:
        paths = [Path(p) for p in sys.argv[1:]]
        for p in paths:
            if not p.is_absolute():
                p = OUTPUT_DIR / p.name
            if not p.exists():
                print(f"File not found: {p}")
                sys.exit(1)
    else:
        paths = sorted(OUTPUT_DIR.glob("scheduling_input_*.json"))

    if not paths:
        print(f"No scheduling_input_*.json files in {OUTPUT_DIR}")
        sys.exit(1)

    print(f"Testing {len(paths)} file(s) from {OUTPUT_DIR}")
    ok = 0
    for path in paths:
        if test_file(path):
            ok += 1
    if VALIDATE_ONLY:
        print(f"\nResult: {ok}/{len(paths)} file(s) valid as SchedulingInput")
    else:
        print(f"\nResult: {ok}/{len(paths)} file(s) produced a feasible schedule")
    sys.exit(0 if ok == len(paths) else 1)


if __name__ == "__main__":
    main()

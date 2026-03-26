"""
Mapping configuration: which input file/sheet and columns map to SchedulingInput.

Primary source: SOC Summary Results (CW_SR_SOC_SUMMARY_RESULTS_MGT2). If the
registrar changes column names, run inspect_sheets.py to rediscover headers.
"""

from pathlib import Path

INPUT_DIR = Path(__file__).resolve().parent / "input"
OUTPUT_DIR = Path(__file__).resolve().parent / "output"

# ---------------------------------------------------------------------------
# Primary source: SOC Summary Results (CW_SR_SOC_SUMMARY_RESULTS_MGT2)
# Row 4 = headers, Row 5+ = data. Columns: Term, Description, Section, Enrl Stat,
#          Units, Session, Days and Times, Room (Capacity), Instructor,
#          Enrl Cap (Cmbnd Enrl Cap), Enrl Tot (Cmbnd Enrl Tot), Subject, ...
# Class number is extracted from Section e.g. "100-LEC(1293)" -> 1293
# ---------------------------------------------------------------------------
SOC_SUMMARY_FILE = "CW_SR_SOC_SUMMARY_RESULTS_MGT2 (1).xlsx"
SOC_SUMMARY_SHEET = "sheet1"

# Legacy: xLab SIS Schedule (kept for reference)
# SIS_SCHEDULE_FILE = "xLab_FINAL_WORKING_2025-2026.xlsx"
# SIS_SCHEDULE_SHEET = "SIS Schedule"

SECTIONS_SOURCE = {
    "file": SOC_SUMMARY_FILE,
    "sheet": SOC_SUMMARY_SHEET,
    "header_row": 4,
    "data_start_row": 5,
    "max_column": 16,  # Required for read_only mode; SOC has columns A-P
    "columns": {
        # SOC Summary column names (exact headers from row 4)
        "Subject": "subject",
        "Description": "title",
        "Section": "section_code",
        "Days and Times": "days_and_times",
        "Room (Capacity)": "room",
        "Instructor": "instructor_name",
        "Enrl Cap (Cmbnd Enrl Cap)": "enrollment_cap",
        "Enrl Tot (Cmbnd Enrl Tot)": "enrollment_total",
    },
}

# ---------------------------------------------------------------------------
# Alternate: SOC Summary for Editors (row 2 = headers, row 3+ = data)
# Columns: Term, Subject, Catalog, Description, Section, ..., Days and Times,
#          Room (Capacity), ..., Instructor(s), Enrl Cap (Cmbnd Enrl Cap), ...
# ---------------------------------------------------------------------------
SOC_EDITORS_FILE = "CW_SR_SOC_SUMMARY_FOR_EDITORS_357731264 (1).xlsx"
SOC_EDITORS_SHEET = "sheet1"
SOC_EDITORS_HEADER_ROW = 2
SOC_EDITORS_DATA_START = 3

# ---------------------------------------------------------------------------
# Course Needs (xLab) – instructor preferences / adjunct info
# Row 1 headers: Instructor, Adjunct/Other, Cross-Listing, Class Days, Class Time,
#                Room, Cap, Instructor, SUBJ, NBR, Course, CW_CLASS_TITLE, SEC, ...
# ---------------------------------------------------------------------------
COURSE_NEEDS_FILE = "xLab_FINAL_WORKING_2025-2026.xlsx"
COURSE_NEEDS_SHEET = "Course Needs_Sp26"
COURSE_NEEDS_HEADER_ROW = 1
COURSE_NEEDS_DATA_START = 2

# ---------------------------------------------------------------------------
# Defaults when building SchedulingInput (solver expects these)
# ---------------------------------------------------------------------------
# Meeting pattern: one pattern per unique (days + time range) with one timeslot set
# Timeslot ID format: day_start_end e.g. "Mon_18:00_20:30"
# Room ID: sanitized room name e.g. "Peter_B_Lewis_401"
# Instructor ID: sanitized name e.g. "Stanek_David"
# Section id: class_nbr as string e.g. "1493"
# course_id: SUBJECT + CATALOG_NBR e.g. "BTEC420"
DEFAULT_ALLOWED_PATTERNS = ["default"]  # single pattern id if we build one pattern per unique slot
DEFAULT_ROOM_REQUIREMENTS: list[str] = []
DEFAULT_TAGS: list[str] = []

# ---------------------------------------------------------------------------
# Timeslot classification rules
# Applied in convert.py when building Timeslot records from parsed times.
# A slot's start_time (24h "HH:MM") is checked against these boundaries.
# ---------------------------------------------------------------------------
TIMESLOT_CLASSIFICATION = {
    "standard": {"start_min": "08:00", "start_max": "16:59"},
    "evening":  {"start_min": "17:00", "start_max": "23:59"},
}

# Section types (from section code suffix) that classify a slot as "lab"
# regardless of time. Takes priority over the time-based rules above.
LAB_SECTION_TYPES = {"LAB", "PRA"}

"""
Mapping configuration: which input file/sheet and columns map to SchedulingInput.
Based on inspect_sheets.py output for:
  - xLab_FINAL_WORKING_2025-2026.xlsx (Course Needs_Sp26, SIS Schedule)
  - CW_SR_SOC_SUMMARY_FOR_EDITORS_357731264 (1).xlsx (sheet1)
  - CW_SR_SOC_SUMMARY_RESULTS_MGT2_Spring 2026.xlsx (sheet1)
"""

from pathlib import Path

INPUT_DIR = Path(__file__).resolve().parent / "input"
OUTPUT_DIR = Path(__file__).resolve().parent / "output"

# ---------------------------------------------------------------------------
# Primary source: xLab SIS Schedule (clean columns, one row per section)
# ---------------------------------------------------------------------------
SIS_SCHEDULE_FILE = "xLab_FINAL_WORKING_2025-2026.xlsx"
SIS_SCHEDULE_SHEET = "SIS Schedule"

# Column header (row 1) -> section field or internal key
# Headers: SUBJECT, CATALOG_NBR, CW_CLASS_TITLE, CLASS_SECTION, SSR_COMPONENT,
#          CLASS_NBR, ENRL_STATUS, CW_SESSION_DESCR, UNITS_RANGE, CW_START_DATE,
#          CW_END_DATE, CLASS_MTG_DAYS, CW_CLASS_MTG_TIMES, CW_MEETING_ROOM,
#          INSTR_NAME, ENRL_CAP, ENRL_TOT, ...
SECTIONS_SOURCE = {
    "file": SIS_SCHEDULE_FILE,
    "sheet": SIS_SCHEDULE_SHEET,
    "header_row": 1,
    "data_start_row": 2,
    "columns": {
        "SUBJECT": "subject",
        "CATALOG_NBR": "catalog_nbr",
        "CW_CLASS_TITLE": "title",
        "CLASS_SECTION": "section_code",
        "CLASS_NBR": "class_nbr",  # use for section id
        "CLASS_MTG_DAYS": "days",
        "CW_CLASS_MTG_TIMES": "times",
        "CW_MEETING_ROOM": "room",
        "INSTR_NAME": "instructor_name",
        "ENRL_CAP": "enrollment_cap",
        "ENRL_TOT": "enrollment_total",
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

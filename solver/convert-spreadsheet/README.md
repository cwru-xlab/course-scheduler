# Spreadsheet to solver data converter

Converts Excel files in `input/` into JSON that matches the solver’s `SchedulingInput` schema (for use with `app.py`’s `POST /solve` or loading later).

## Setup

From this directory:

```bash
pip install -r requirements.txt
```

Requires Python 3.12+ and `openpyxl`.

## Inspect spreadsheet structure

To list sheet names and the first few rows of each sheet (e.g. to add or adjust mappings):

```bash
python inspect_sheets.py
```

## Run the converter

```bash
python convert.py [output_label]
```

- Reads from `input/` using the mapping in `config.py`.
- Writes `output/scheduling_input_<output_label>.json`. Default label is `spring2026`.
- Example: `python convert.py fall2026` → `output/scheduling_input_fall2026.json`.

If the solver environment is available (e.g. `uv run` from the `solver` directory with `ortools` installed), the script will validate the output against `app.SchedulingInput`. Otherwise it still writes the JSON without validation.

## Input files and mapping

- **Primary source:** `xLab_FINAL_WORKING_2025-2026.xlsx` → sheet **SIS Schedule**
  - Row 1: headers (SUBJECT, CATALOG_NBR, CW_CLASS_TITLE, CLASS_SECTION, CLASS_NBR, CLASS_MTG_DAYS, CW_CLASS_MTG_TIMES, CW_MEETING_ROOM, INSTR_NAME, ENRL_CAP, ENRL_TOT, …)
  - Rows 2+: one row per section.

- **Mapping to SchedulingInput:**
  - **Sections:** section `id` = CLASS_NBR; `course_id` = SUBJECT + CATALOG_NBR; `section_code` = CLASS_SECTION; `instructor_id` = normalized INSTR_NAME; enrollment from ENRL_CAP / ENRL_TOT; days/times parsed into `allowed_meeting_patterns` (one pattern per unique day/time combo).
  - **Instructors:** one per unique INSTR_NAME; `id` = normalized name; `rank_type` = "Faculty"; preferences empty.
  - **Rooms:** one per unique CW_MEETING_ROOM; `id` = normalized room name; `capacity` from section ENRL_CAP or default 50; `features` = [].
  - **Timeslots:** one per unique (day, start_time, end_time); `id` = e.g. `Mon_1800_2030`.
  - **Meeting patterns:** one per unique (days + time range); `compatible_timeslot_sets` = list of timeslot ids for that pattern.
  - **crosslist_groups, no_overlap_groups, blocked_times, locked_assignments, soft_locks:** not read from the current spreadsheets; output as empty lists.

To change which file or sheet is used, or to add columns, edit `config.py`.

## Output

- **Path:** `output/scheduling_input_<label>.json`
- **Shape:** Single JSON object with keys: `sections`, `instructors`, `rooms`, `timeslots`, `meeting_patterns`, `crosslist_groups`, `no_overlap_groups`, `blocked_times`, `locked_assignments`, `soft_locks`. Compatible with `ScheduleRequest.input` in the solver API.

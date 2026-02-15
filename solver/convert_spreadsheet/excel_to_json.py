import json
import os
import re

import openpyxl

def get_original_text(cell):
    """
    Extracts text from a cell
    Assumes Black/Auto color is the original text (even if crossed out).
    """
    if cell.value is None:
        return ""
    
    if not isinstance(cell.value, str):
        return str(cell.value)
        
    if not hasattr(cell, 'rich_text') or not cell.rich_text:
        return str(cell.value)

    # Reconstruct text segment by segment
    clean_text = ""
    for segment in cell.rich_text:
        is_red = False
        if segment.font.color and segment.font.color.rgb:
            hex_code = str(segment.font.color.rgb).upper()
            if 'FF0000' in hex_code or 'C00000' in hex_code:
                is_red = True
        
        if not is_red:
            clean_text += str(segment.text)
            
    return clean_text

def _cell(row_cells, headers, name, default=None):
    """Safely get cell value by header name."""
    if name not in headers:
        return default
    i = headers.index(name)
    if i >= len(row_cells):
        return default
    return row_cells[i].value if hasattr(row_cells[i], "value") else default


def clean_excel_to_json(input_file, output_file):
    # 1. Load workbook with data_only=False so we can read rich text (unedited "Days and Times")
    wb = openpyxl.load_workbook(input_file, data_only=False)
    ws = wb.active

    # 2. Header row is row 4; data starts at row 5
    rows = list(ws.iter_rows(min_row=4))
    header_cells = rows[0]
    headers = [str(cell.value).strip() if cell.value is not None else "" for cell in header_cells]

    try:
        dt_index = headers.index("Days and Times")
    except ValueError:
        print("Error: Could not find 'Days and Times' column.")
        return

    courses_list = []

    for row_cells in rows[1:]:
        clean_sched_text = get_original_text(row_cells[dt_index])
        if not clean_sched_text or not str(clean_sched_text).strip():
            continue

        meetings = []
        for line in clean_sched_text.split("\n"):
            line = line.strip()
            if not line:
                continue
            time_match = re.search(
                r"(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)", line, re.IGNORECASE
            )
            if time_match:
                start = time_match.group(1)
                end = time_match.group(2)
                days_str = line[: time_match.start()].strip()
                days_map = {
                    "M": "Mon", "Tu": "Tue", "W": "Wed", "Th": "Thu",
                    "F": "Fri", "Sa": "Sat", "Su": "Sun",
                }
                day_tokens = re.findall(r"(Tu|Th|Sa|Su|M|W|F)", days_str)
                expanded_days = [days_map[d] for d in day_tokens if d in days_map]
                meetings.append({
                    "days": expanded_days if expanded_days else ["TBA"],
                    "startTime": start,
                    "endTime": end,
                    "rawString": line,
                })

        if not meetings:
            continue

        instr_val = _cell(row_cells, headers, "Instructor") or ""
        instructors = [s.strip() for s in str(instr_val).split("\n") if s.strip()]

        course_obj = {
            "subject": _cell(row_cells, headers, "Subject"),
            "description": _cell(row_cells, headers, "Description"),
            "section": _cell(row_cells, headers, "Section"),
            "instructor": instructors,
            "room": _cell(row_cells, headers, "Room (Capacity)"),
            "enrollmentCap": _cell(row_cells, headers, "Enrl Cap (Cmbnd Enrl Cap)"),
            "units": _cell(row_cells, headers, "Units"),
            "session": _cell(row_cells, headers, "Session"),
            "schedule": meetings,
        }
        courses_list.append(course_obj)

    os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(courses_list, f, indent=2, ensure_ascii=False)
    print(f"Successfully converted to {output_file}")


def main():
    clean_excel_to_json(
        "input/CW_SR_SOC_SUMMARY_RESULTS_MGT2_Spring 2026.xlsx",
        "output/cleaned_schedule.json",
    )


if __name__ == "__main__":
    main()
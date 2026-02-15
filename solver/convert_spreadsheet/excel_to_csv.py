import os
import re
import pandas as pd
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

    clean_text = ""
    for segment in cell.rich_text:
        # Check text color
        is_red = False
        if segment.font.color and segment.font.color.rgb:
            hex_code = str(segment.font.color.rgb).upper()
            if 'FF0000' in hex_code or 'C00000' in hex_code:
                is_red = True
        
        if not is_red:
            clean_text += str(segment.text)
            
    return clean_text

def parse_schedule(row):
    """
    Parses the messy 'Days and Times' string into structured data.
    """
    raw_sched = row['Clean_Schedule']
    if not raw_sched or pd.isna(raw_sched) or raw_sched.strip() == '':
        return []

    # Split by newlines to handle multiple meeting patterns
    lines = raw_sched.split('\n')
    parsed_meetings = []

    for line in lines:
        line = line.strip()
        if not line: continue

        # Regex to find time range (e.g. 1:00PM-2:15PM or 1:00PM - 2:15PM)
        time_match = re.search(r'(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)', line, re.IGNORECASE)

        if time_match:
            start_str = time_match.group(1)
            end_str = time_match.group(2)

            # Extract the days part (everything before the time)
            days_str = line[:time_match.start()].strip()

            # Normalize Days
            days_map = {
                'M': 'Mon', 'Tu': 'Tue', 'W': 'Wed', 'Th': 'Thu', 'F': 'Fri', 'Sa': 'Sat', 'Su': 'Sun'
            }
            active_days = []

            day_tokens = re.findall(r'(Tu|Th|Sa|Su|M|W|F)', days_str)
            for token in day_tokens:
                if token in days_map:
                    active_days.append(days_map[token])


            if not active_days:
                days_value = 'TBA'
            else:
                # e.g. ["Mon", "Wed"] -> "Mon,Wed"
                days_value = ",".join(active_days)

            parsed_meetings.append({
                'Days': days_value,
                'Start_Time': start_str,
                'End_Time': end_str
            })
    return parsed_meetings

def clean_excel_to_csv(input_file, output_file):
    # 1. Load Workbook with data_only=False so we can read rich text (to get unedited "Days and Times")
    wb = openpyxl.load_workbook(input_file, data_only=False)
    ws = wb.active

    # 2. Header row is row 4; data starts at row 5
    rows = list(ws.iter_rows(min_row=4))
    header_cells = rows[0]
    headers = [str(cell.value).strip() if cell.value is not None else "" for cell in header_cells]
    
    # Find the index of "Days and Times"
    try:
        dt_index = headers.index("Days and Times")
    except ValueError:
        print("Error: Could not find 'Days and Times' column.")
        return

    data = []
    # Iterate actual data rows
    for row_cells in rows[1:]:
        row_dict = {}
        # Basic mapping of values
        for i, cell in enumerate(row_cells):
            if i < len(headers):
                # SPECIAL HANDLING for Days and Times column
                if i == dt_index:
                    row_dict['Clean_Schedule'] = get_original_text(cell)
                else:
                    row_dict[headers[i]] = cell.value
        data.append(row_dict)

    df = pd.DataFrame(data)

    # 3. Filter out rows that are completely empty
    df = df.dropna(how='all')
    # Filter out rows with no schedule text (keep only unedited/parseable schedule)
    if "Clean_Schedule" not in df.columns:
        print("Error: No 'Clean_Schedule' column.")
        return
    df["Clean_Schedule"] = df["Clean_Schedule"].fillna("").astype(str)
    df = df[df["Clean_Schedule"].str.strip() != ""]
    
    # 4. Explode the Schedule
    # Apply the parser
    schedule_data = df.apply(parse_schedule, axis=1)
    
    # Create a new list for the flat dataframe
    flat_rows = []
    for idx, meetings in schedule_data.items():
        original_row = df.loc[idx].to_dict()
        for meeting in meetings:
            new_row = original_row.copy()
            new_row.update(meeting)
            flat_rows.append(new_row)
            
    final_df = pd.DataFrame(flat_rows)
    
    # 5. Select and reorder useful columns (classes, times, and related info)
    cols_to_keep = [
        "Subject", "Description", "Section", "Days", "Start_Time", "End_Time",
        "Room (Capacity)", "Enrollment_Cap", "Instructor", "Session", "Units"
    ]

    # Normalize "Enrollment Cap" to a consistent column name
    if "Enrl Cap (Cmbnd Enrl Cap)" in final_df.columns and "Enrollment_Cap" not in final_df.columns:
        final_df = final_df.rename(columns={"Enrl Cap (Cmbnd Enrl Cap)": "Enrollment_Cap"})

    available_cols = [c for c in cols_to_keep if c in final_df.columns]
    final_df = final_df[available_cols]

    # 6. Ensure output directory exists and save
    os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)
    final_df.to_csv(output_file, index=False)
    print(f"Successfully converted to {output_file}")


def main():
    clean_excel_to_csv(
        "input/CW_SR_SOC_SUMMARY_RESULTS_MGT2_Spring 2026.xlsx",
        "output/cleaned_schedule.csv",
    )

if __name__ == "__main__":
    main()
    
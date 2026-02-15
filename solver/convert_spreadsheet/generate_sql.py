import json
import re


# Load the JSON data
try:
    with open('output/cleaned_schedule.json', 'r') as f:
        data = json.load(f)
except FileNotFoundError:
    print("Error: 'cleaned_schedule.json' not found. Make sure the file is in the same directory.")
    data = []

# import gspread
# import pandas as pd
# import os
# from dotenv import load_dotenv

# load_dotenv()

# gc = gspread.service_account(filename=os.getenv("GOOGLE_SERVICE_CREDENTIALS"))

# SPREADSHEET_ID = "1eISPVaGvFxi5ZqZSozYOClNBZeQTXm18RsX0168F1ns"
# sh = gc.open_by_key(SPREADSHEET_ID)
# worksheet = sh.sheet1

# data = worksheet.get_all_records(expected_headers=4)

# output file
output_file = "sql/insert_schedule_data.sql"

# Mappings to track IDs
instructor_map = {} 
room_map = {}       
course_map = {}     
section_id_counter = 1
meeting_id_counter = 1

def escape_sql(text):
    """Safely escapes text for SQL."""
    if text is None:
        return "NULL"
    text = str(text)
    return "'" + text.replace("'", "''") + "'"

def clean_int(value):
    """
    Parses a string/number into a clean integer. 
    If it finds multiple numbers (e.g. '60 59'), it takes the first one.
    If it finds no numbers, returns 0.
    """
    if value is None or value == '':
        return 0
    
    # If it's already an int or float, return it as int
    if isinstance(value, (int, float)):
        return int(value)
        
    match = re.search(r'\d+', str(value))
    if match:
        return int(match.group())
    
    return 0

with open(output_file, 'w', encoding='utf-8') as f:
    f.write("-- SQL Import Script for Class Schedule\n")
    f.write("BEGIN;\n\n")

    # 1. INSTRUCTORS
    f.write("-- 1. INSTRUCTORS\n")
    current_id = 1
    for entry in data:
        instructors = entry.get('instructor', [])
        if not isinstance(instructors, list): 
            continue 

        for instr_name in instructors:
            if instr_name and instr_name not in instructor_map:
                instructor_map[instr_name] = current_id
                f.write(f"INSERT INTO instructors (instructor_id, name, type) VALUES ({current_id}, {escape_sql(instr_name)}, NULL);\n")
                current_id += 1
    
    f.write(f"SELECT setval('instructors_instructor_id_seq', {current_id});\n\n")

    # 2. ROOMS
    f.write("-- 2. ROOMS\n")
    current_id = 1
    for entry in data:
        room_name = entry.get('room')
        if room_name and room_name not in room_map:
            room_map[room_name] = current_id
            f.write(f"INSERT INTO rooms (room_id, room_number, capacity, features) VALUES ({current_id}, {escape_sql(room_name)}, NULL, NULL);\n")
            current_id += 1
    f.write(f"SELECT setval('rooms_room_id_seq', {current_id});\n\n")

    # Courses
    f.write("-- 3. COURSES\n")
    current_id = 1
    for entry in data:
        raw_subject = entry.get('subject')
        raw_desc = entry.get('description', '')
        
        raw_units = entry.get('units')
        
        if raw_units is None or raw_units == '':
            units_sql = "NULL"
        else:
            # Convert to string
            units_str = str(raw_units)
            if '-' in units_str:
                try:
                    parts = units_str.split('-')
                    # Take the last part (max units)
                    units_sql = parts[-1].strip() 
                except:
                    units_sql = "0"
            else:
                # Just use the value
                units_sql = units_str

        # Fallback logic for subject
        if raw_subject:
            subject = raw_subject
        else:
            subject = raw_desc

        title = raw_desc
        course_key = (subject, title)
        
        if course_key not in course_map:
            course_map[course_key] = current_id
            # Use the cleaned units_sql variable here
            f.write(f"INSERT INTO courses (course_id, subject, title, units) VALUES ({current_id}, {escape_sql(subject)}, {escape_sql(title)}, {units_sql});\n")
            current_id += 1
    f.write(f"SELECT setval('courses_course_id_seq', {current_id});\n\n")
    # 4. SECTIONS & MEETINGS
    f.write("-- 4. SECTIONS & MEETINGS\n")
    
    for entry in data:
        subject = entry.get('subject', 'UNK')
        title = entry.get('description', '')
        course_id = course_map.get((subject, title), "NULL")
        
        section_num = str(entry.get('section', '000'))
        
        raw_cap = entry.get('enrollmentCap')
        enrl_cap = clean_int(raw_cap)
        
        f.write(f"INSERT INTO sections (section_id, course_id, section_number, enrollment_cap) VALUES ({section_id_counter}, {course_id}, {escape_sql(section_num)}, {enrl_cap});\n")
        
        # Write Meetings
        schedule_list = entry.get('schedule', [])
        current_room_name = entry.get('room')
        room_id = room_map.get(current_room_name, "NULL")
        
        if isinstance(schedule_list, list):
            for sched in schedule_list:
                start_time = sched.get('startTime')
                end_time = sched.get('endTime')
                days = sched.get('days', [])
                
                for day in days:
                    f.write(f"INSERT INTO meetings (meeting_id, section_id, room_id, day_of_week, start_time, end_time) VALUES ({meeting_id_counter}, {section_id_counter}, {room_id}, {escape_sql(day)}, {escape_sql(start_time)}, {escape_sql(end_time)});\n")
                    meeting_id_counter += 1
        
        section_id_counter += 1

    f.write(f"SELECT setval('sections_section_id_seq', {section_id_counter});\n")
    f.write(f"SELECT setval('meetings_meeting_id_seq', {meeting_id_counter});\n")
    
    f.write("COMMIT;\n")

print(f"Successfully generated {output_file}")
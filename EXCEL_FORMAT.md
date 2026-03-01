# Excel File Format for Course Scheduler

## Required Sheets

The Excel file should contain the following sheets (case-insensitive):

### 1. Courses
| Column | Type | Description | Example |
|--------|------|-------------|---------|
| id | String | Unique course identifier | "CS101" |
| title | String | Course title | "Introduction to Computer Science" |
| department | String | Department code | "CS" |
| is_core | Boolean | Is this a core course? | TRUE/FALSE |
| is_new | Boolean | Is this a new course? | TRUE/FALSE |

### 2. Instructors
| Column | Type | Description | Example |
|--------|------|-------------|---------|
| id | String | Unique instructor identifier | "PROF001" |
| name | String | Instructor name | "Dr. Smith" |
| rank_type | String | Instructor rank | "Full-time", "Adjunct" |
| preferred_days | String | Preferred teaching days (comma-separated) | "MWF" or "M,W,F" |
| preferred_patterns | String | Preferred meeting patterns | "MWF-morning" |
| max_teaching_days | Integer | Max days per week (for adjuncts) | 3 |

### 3. Rooms
| Column | Type | Description | Example |
|--------|------|-------------|---------|
| id | String | Unique room identifier | "BLDG101" |
| building | String | Building name | "Science Building" |
| room_number | String | Room number | "101" |
| capacity | Integer | Room capacity | 50 |
| room_type | String | Type of room | "lecture", "lab", "seminar" |
| has_av | Boolean | Has audio/visual equipment | TRUE/FALSE |
| is_accessible | Boolean | Is accessible | TRUE/FALSE |
| features | String | Additional features (comma-separated) | "projector,whiteboard" |

### 4. Sections
| Column | Type | Description | Example |
|--------|------|-------------|---------|
| id | String | Unique section identifier | "CS101-001" |
| course_id | String | Reference to course ID | "CS101" |
| section_code | String | Section code | "001" |
| instructor_id | String | Reference to instructor ID | "PROF001" |
| section_type | String | Type of section | "lecture", "lab" |
| expected_enrollment | Integer | Expected number of students | 30 |
| enrollment_cap | Integer | Maximum enrollment | 35 |
| allowed_meeting_patterns | String | Allowed patterns (comma-separated) | "MWF-morning,MWF-afternoon" |
| room_requirements | String | Required room features | "projector,lab" |
| tags | String | Additional tags | "honors,online-hybrid" |

### 5. Timeslots (Optional)
If not provided, default timeslots will be used.

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| id | String | Unique timeslot identifier | "MWF-0815" |
| days | String | Days of the week | "MWF", "TR" |
| start_time | Time | Start time (HH:MM) | "08:15" |
| end_time | Time | End time (HH:MM) | "09:05" |
| slot_type | String | Type of slot | "standard", "evening" |

### 6. MeetingPatterns (Optional)
| Column | Type | Description | Example |
|--------|------|-------------|---------|
| id | String | Pattern identifier | "MWF-morning" |
| slots_required | Integer | Number of slots needed | 3 |
| allowed_days | String | Allowed days | "M,W,F" |
| compatible_timeslot_sets | String | Compatible timeslots | "MWF-0815;MWF-0920" |

## Notes

1. **Boolean values**: Use TRUE/FALSE, Yes/No, or 1/0
2. **Lists**: Use comma (,) or semicolon (;) to separate multiple values
3. **Times**: Use HH:MM format (24-hour)
4. **Optional sheets**: If Timeslots or MeetingPatterns sheets are not provided, defaults will be used

## Example Data

See the included `sample_schedule.xlsx` file for a complete example.
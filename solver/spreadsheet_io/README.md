# Scheduling Spreadsheet Contract

This workbook format is the interchange schema for the scheduler UI's `SchedulingInput`.

## Delimiters
- Simple list fields use `;` separator.
  - Example: `TS-M-0900;TS-W-0900`
- Nested list fields (`compatible_timeslot_sets`) use:
  - `;` between sets
  - `|` between IDs inside a set
  - Example: `TS-M-0900|TS-W-0900;TS-M-1030|TS-W-1030`

## Required sheets and columns

### `Sections`
`id`, `course_id`, `section_code`, `instructor_id`, `expected_enrollment`,
`enrollment_cap`, `allowed_meeting_patterns`, `room_requirements`,
`crosslist_group_id`, `tags`

### `Instructors`
`id`, `rank_type`, `unavailable_times`, `preferred_days`,
`preferred_patterns`, `max_teaching_days`

### `Rooms`
`id`, `building`, `capacity`, `features`

### `Timeslots`
`id`, `day`, `start_time`, `end_time`

### `MeetingPatterns`
`id`, `slots_required`, `allowed_days`, `compatible_timeslot_sets`

### `CrosslistGroups`
`id`, `member_section_ids`, `require_same_room`

### `NoOverlapGroups`
`id`, `member_section_ids`, `reason`

### `BlockedTimes`
`scope`, `timeslot_ids`, `reason`

### `LockedAssignments`
`section_id`, `fixed_timeslot_set`, `fixed_room`

### `SoftLocks`
`section_id`, `preferred_timeslot_set`, `preferred_room`, `weight`

## Template
- Generate a fresh template:
  - `cd solver`
  - `python spreadsheet_io/generate_template.py`

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
`id`, `course_id`, `department`, `section_code`, `section_number`, `instructor_id`,
`expected_enrollment`, `enrollment_cap`, `allowed_meeting_patterns`,
`room_requirements`, `crosslist_group_id`, `tags`, `term`, `assigned_half`,
`previous_meeting_pattern`, `state`, `prev_notes`, `new_notes`

`term` is `full` (default), `half_any`, `first_half`, or `second_half`. Import normalizes aliases (`half`, `1st_half`, `h1`, etc.). Legacy workbooks without `term` import as `full`; MBAP `half-1`/`half-2` tags are a fallback when `term` is absent.

`assigned_half` is optional — set to `first_half` or `second_half` when `term` is `half_any` and the half has been resolved (calendar placement or solver). Blank for other terms.

`state` is `active` (default), `new`, or `archived`. `new` marks a section as newly added (scheduled like active). Archived sections are excluded from the solver and hidden on the calendar.

`prev_notes` / `new_notes` are consumed by the platform UI (not the solver). Export fills `prev_notes`; planners add text in `new_notes` for import.

### `Instructors`
`id`, `name`, `rank_type`, `unavailable_times`, `preferred_days`,
`preferred_patterns`, `max_teaching_days`, `prev_notes`, `new_notes`

### `Rooms`
`id`, `building`, `room_number`, `capacity`, `features`, `prev_notes`, `new_notes`

### `Timeslots`
`id`, `day`, `start_time`, `end_time`, `slot_type`, `prev_notes`, `new_notes`

### `MeetingPatterns`
`id`, `slots_required`, `allowed_days`, `compatible_timeslot_sets`, `prev_notes`, `new_notes`

### `Notes` (platform)
`scope`, `row_key`, `note_id`, `parent_note_id`, `seq`, `created_at`, `author`, `completed`, `body`, `source`

Structured note/reply rows for round-trip. Optional on import; populated on export from the app.

### `CrosslistGroups`
`id`, `member_section_ids`

### `NoOverlapGroups`
`id`, `member_section_ids`, `reason`

### `BlockedTimes`
`scope`, `timeslot_ids`, `reason`

### `LockedAssignments`
`section_id`, `fixed_timeslot_set`, `fixed_room`

### `SoftLocks`
`section_id`, `preferred_timeslot_set`, `preferred_room`, `weight`

## Presentation (export & template)

Exported and template workbooks are formatted for readability:

- **Frozen header row** on every sheet
- **Bold header** row with light background
- **Column widths** sized from header + cell content (wider for `prev_notes`, `new_notes`, `body`, long list fields)
- **Wrap text** on note columns and other long-text fields; top-aligned cells
- **`prev_notes`**: light gray fill; **`new_notes`**: light yellow fill (entity sheets)

Notes are embedded during export in the solver (openpyxl) so formatting is preserved.

## Template
- Generate a fresh template:
  - `cd solver`
  - `python spreadsheet_io/generate_template.py`

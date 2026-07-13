/**
 * Shared spreadsheet-format constants.
 *
 * Kept in its own dependency-free module so both `formatGuide.ts` and
 * `errors/humanizeError.ts` can import them without creating an import cycle
 * (formatGuide imports the humanizer, so the humanizer must not import formatGuide).
 */

export const EXAMPLE_SPREADSHEET_PATH = "/example-format-spreadsheet.xlsx";
export const EXAMPLE_SPREADSHEET_FILENAME = "example-format-spreadsheet.xlsx";

export const REQUIRED_SHEETS = [
  "Sections",
  "Instructors",
  "Rooms",
  "Timeslots",
  "MeetingPatterns",
  "CrosslistGroups",
  "NoOverlapGroups",
  "BlockedTimes",
  "LockedAssignments",
  "SoftLocks",
] as const;

export const FORMAT_RULES_SUMMARY =
  "Use the same sheet names and column headers as the example file. List values use semicolons (;). Nested timeslot sets use pipes (|).";

export const FORMAT_COMPARE_HINT = `Compare your spreadsheet to ${EXAMPLE_SPREADSHEET_FILENAME} — the row content can differ, but sheet names, headers, and cell formatting rules must match.`;

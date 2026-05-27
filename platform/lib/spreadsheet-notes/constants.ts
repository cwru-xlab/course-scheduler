export const NOTES_SHEET_NAME = "Notes";

export const NOTES_SHEET_COLUMNS = [
  "scope",
  "row_key",
  "note_id",
  "parent_note_id",
  "seq",
  "created_at",
  "author",
  "completed",
  "body",
  "source",
] as const;

export const ENTITY_NOTE_SHEETS: Array<{
  sheetName: string;
  scope: string;
  idColumn: string;
}> = [
  { sheetName: "Sections", scope: "sections", idColumn: "id" },
  { sheetName: "Instructors", scope: "instructors", idColumn: "id" },
  { sheetName: "Rooms", scope: "rooms", idColumn: "id" },
  { sheetName: "Timeslots", scope: "timeslots", idColumn: "id" },
  { sheetName: "MeetingPatterns", scope: "meeting-patterns", idColumn: "id" },
];

export const PREV_NOTES_COLUMN = "prev_notes";
export const NEW_NOTES_COLUMN = "new_notes";

/** Split multiple new notes in one spreadsheet cell. */
export const NEW_NOTE_CELL_SEPARATOR = "\n---\n";

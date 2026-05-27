export type RowReply = {
  id: string;
  note: string;
  author: string;
  createdAt: string;
};

export type RowNote = {
  id: string;
  note: string;
  author: string;
  completed: boolean;
  createdAt: string;
  replies?: RowReply[];
};

export type NoteScope =
  | "sections"
  | "instructors"
  | "rooms"
  | "timeslots"
  | "meeting-patterns"
  | "constraints-crosslist-groups"
  | "constraints-no-overlap-groups"
  | "constraints-blocked-times"
  | "constraints-locked-assignments"
  | "constraints-soft-locks";

export type NotesRowEntry = {
  scope: string;
  rowKey: string;
  notes: RowNote[];
};

/** Per-row merge payload produced by spreadsheet import. */
export type NotesRowPatch = {
  scope: string;
  rowKey: string;
  fromSheet: RowNote[];
  newNotes: RowNote[];
};

export type NotesSheetRow = {
  scope: string;
  row_key: string;
  note_id: string;
  parent_note_id: string;
  seq: string;
  created_at: string;
  author: string;
  completed: string;
  body: string;
  source: string;
};

export type NotesImportSummary = {
  rowsUpdated: number;
  notesAdded: number;
  notesFromSheet: number;
  repliesFromSheet: number;
  notesRemoved: number;
};

export const NOTES_STORAGE_PREFIX = "wsom-row-notes::";

export function notesStorageKey(scope: string, rowKey: string): string {
  return `${NOTES_STORAGE_PREFIX}${scope}::${rowKey}`;
}

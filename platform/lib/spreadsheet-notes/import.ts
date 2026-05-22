import type { NotesImportSummary, NotesRowPatch, RowNote } from "@/lib/notes/types";
import { formatNoteAuthor } from "@/lib/note-author";
import {
  formatPrevNotesDisplay,
  newNoteId,
  newReplyId,
  parsePrevNotesDisplay,
  splitNewNotesCell,
} from "@/lib/spreadsheet-notes/format";
import {
  buildNotesPatches,
  parseNotesSheetFromRows,
  sheetRowsToNotesByRow,
} from "@/lib/spreadsheet-notes/notes-sheet";
import {
  readEntityNewNotes,
  readEntityPrevNotes,
  readNotesSheetRows,
  readWorkbook,
} from "@/lib/spreadsheet-notes/workbook";

export type ImportNotesContext = {
  author: string;
  importedAt: string;
};

export type ParseNotesResult = {
  patches: NotesRowPatch[];
  summary: NotesImportSummary;
};

function createImportedNote(body: string, ctx: ImportNotesContext): RowNote {
  return {
    id: newNoteId(),
    note: body,
    author: ctx.author,
    createdAt: ctx.importedAt,
    completed: false,
    replies: [],
  };
}

export function parseNotesFromWorkbook(
  fileBytes: ArrayBuffer,
  user: { name: string; email: string } | null,
): ParseNotesResult {
  const importedAt = new Date().toISOString();
  const author = user ? formatNoteAuthor(user) : "Unknown";
  const ctx: ImportNotesContext = { author, importedAt };

  const workbook = readWorkbook(fileBytes);
  const sheetRows = parseNotesSheetFromRows(readNotesSheetRows(workbook));
  const sheetByRow = sheetRowsToNotesByRow(sheetRows);

  // Fallback: structured prev_notes when Notes sheet has no rows for a row
  if (sheetRows.length === 0) {
    for (const { scope, rowKey, prevNotesText } of readEntityPrevNotes(workbook)) {
      const parsed = parsePrevNotesDisplay(prevNotesText);
      if (parsed.length === 0) continue;
      const key = `${scope}::${rowKey}`;
      sheetByRow.set(key, parsed);
    }
  } else {
    for (const { scope, rowKey, prevNotesText } of readEntityPrevNotes(workbook)) {
      const key = `${scope}::${rowKey}`;
      if (sheetByRow.has(key)) continue;
      const parsed = parsePrevNotesDisplay(prevNotesText);
      if (parsed.length > 0) sheetByRow.set(key, parsed);
    }
  }

  const newByRow = new Map<string, RowNote[]>();
  for (const { scope, rowKey, newNotesText } of readEntityNewNotes(workbook)) {
    const bodies = splitNewNotesCell(newNotesText);
    if (bodies.length === 0) continue;
    const key = `${scope}::${rowKey}`;
    const notes = bodies.map((body) => createImportedNote(body, ctx));
    newByRow.set(key, [...(newByRow.get(key) ?? []), ...notes]);
  }

  const patches = buildNotesPatches(sheetByRow, newByRow);
  let notesAdded = 0;
  let notesFromSheet = 0;
  let repliesFromSheet = 0;
  for (const patch of patches) {
    notesAdded += patch.newNotes.length;
    for (const n of patch.fromSheet) {
      notesFromSheet += 1;
      repliesFromSheet += n.replies?.length ?? 0;
    }
  }

  return {
    patches,
    summary: {
      rowsUpdated: patches.length,
      notesAdded,
      notesFromSheet,
      repliesFromSheet,
      notesRemoved: 0,
    },
  };
}

/** Build prev_notes display map for export. */
export function buildPrevNotesDisplayMap(
  entries: Array<{ scope: string; rowKey: string; notes: RowNote[] }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    map.set(`${entry.scope}::${entry.rowKey}`, formatPrevNotesDisplay(entry.notes));
  }
  return map;
}

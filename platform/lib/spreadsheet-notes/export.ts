import type { NotesRowEntry } from "@/lib/notes/types";
import { buildPrevNotesDisplayMap } from "@/lib/spreadsheet-notes/import";
import { notesEntriesToSheetRows } from "@/lib/spreadsheet-notes/notes-sheet";
import {
  readWorkbook,
  setEntityNoteColumns,
  workbookToBuffer,
  writeNotesSheet,
} from "@/lib/spreadsheet-notes/workbook";
import { NOTES_SHEET_COLUMNS } from "@/lib/spreadsheet-notes/constants";

export function applyNotesToExportWorkbook(
  solverXlsxBytes: ArrayBuffer,
  noteEntries: NotesRowEntry[],
): Buffer {
  const workbook = readWorkbook(solverXlsxBytes);
  const prevMap = buildPrevNotesDisplayMap(noteEntries);
  setEntityNoteColumns(workbook, prevMap, true);

  const sheetRows = notesEntriesToSheetRows(noteEntries);
  const rowRecords = sheetRows.map((row) => {
    const record: Record<string, string> = {};
    for (const col of NOTES_SHEET_COLUMNS) {
      record[col] = String(row[col as keyof typeof row] ?? "");
    }
    return record;
  });
  writeNotesSheet(workbook, rowRecords);

  return workbookToBuffer(workbook);
}

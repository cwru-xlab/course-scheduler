import * as XLSX from "xlsx";

import {
  ENTITY_NOTE_SHEETS,
  NEW_NOTES_COLUMN,
  NOTES_SHEET_COLUMNS,
  NOTES_SHEET_NAME,
  PREV_NOTES_COLUMN,
} from "@/lib/spreadsheet-notes/constants";

export type SheetRow = Record<string, string>;

function cellValue(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function findHeaderRow(sheet: XLSX.WorkSheet, marker: string): { rowIndex: number; headers: string[] } | null {
  const ref = sheet["!ref"];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 8); r += 1) {
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c });
      headers.push(cellValue(sheet[addr]?.v));
    }
    if (headers.some((h) => h.toLowerCase() === marker.toLowerCase())) {
      return { rowIndex: r, headers };
    }
  }
  return null;
}

function columnIndex(headers: string[], name: string): number {
  const lower = name.toLowerCase();
  return headers.findIndex((h) => h.toLowerCase() === lower);
}

export function readWorkbook(buffer: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: "array", cellDates: true });
}

export function workbookToBuffer(workbook: XLSX.WorkBook): Buffer {
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

export function readSheetRows(workbook: XLSX.WorkBook, sheetName: string): SheetRow[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const headerInfo = findHeaderRow(sheet, "id");
  if (!headerInfo) return [];

  const { rowIndex, headers } = headerInfo;
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: SheetRow[] = [];

  for (let r = rowIndex + 1; r <= range.e.r; r += 1) {
    const row: SheetRow = {};
    let hasValue = false;
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const header = headers[c - range.s.c];
      if (!header) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      const value = cellValue(sheet[addr]?.v);
      if (value) hasValue = true;
      row[header] = value;
    }
    if (hasValue) rows.push(row);
  }
  return rows;
}

export function readNotesSheetRows(workbook: XLSX.WorkBook): Record<string, unknown>[] {
  const sheet = workbook.Sheets[NOTES_SHEET_NAME];
  if (!sheet) return [];
  const headerInfo = findHeaderRow(sheet, "scope");
  if (!headerInfo) return [];

  const { rowIndex, headers } = headerInfo;
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: Record<string, unknown>[] = [];

  for (let r = rowIndex + 1; r <= range.e.r; r += 1) {
    const row: Record<string, unknown> = {};
    let hasValue = false;
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const header = headers[c - range.s.c];
      if (!header) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      const value = sheet[addr]?.v ?? "";
      if (cellValue(value)) hasValue = true;
      row[header] = value;
    }
    if (hasValue) rows.push(row);
  }
  return rows;
}

function ensureColumn(sheet: XLSX.WorkSheet, headerRow: number, columnName: string): number {
  const ref = sheet["!ref"];
  if (!ref) {
    sheet["!ref"] = "A1:A1";
  }
  const range = XLSX.utils.decode_range(sheet["!ref"]!);
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c });
    headers.push(cellValue(sheet[addr]?.v));
  }
  let idx = columnIndex(headers, columnName);
  if (idx >= 0) return range.s.c + idx;

  const newCol = range.e.c + 1;
  const addr = XLSX.utils.encode_cell({ r: headerRow, c: newCol });
  sheet[addr] = { t: "s", v: columnName };
  range.e.c = newCol;
  sheet["!ref"] = XLSX.utils.encode_range(range);
  return newCol;
}

export function setEntityNoteColumns(
  workbook: XLSX.WorkBook,
  prevNotesByRow: Map<string, string>,
  clearNewNotes: boolean,
): void {
  for (const spec of ENTITY_NOTE_SHEETS) {
    const sheet = workbook.Sheets[spec.sheetName];
    if (!sheet) continue;
    const headerInfo = findHeaderRow(sheet, spec.idColumn);
    if (!headerInfo) continue;

    const { rowIndex, headers } = headerInfo;
    const idIdx = columnIndex(headers, spec.idColumn);
    if (idIdx < 0) continue;

    const prevCol = ensureColumn(sheet, rowIndex, PREV_NOTES_COLUMN);
    const newCol = ensureColumn(sheet, rowIndex, NEW_NOTES_COLUMN);
    const ref = sheet["!ref"]!;
    const range = XLSX.utils.decode_range(ref);

    for (let r = rowIndex + 1; r <= range.e.r; r += 1) {
      const idAddr = XLSX.utils.encode_cell({ r, c: range.s.c + idIdx });
      const rowId = cellValue(sheet[idAddr]?.v);
      if (!rowId) continue;
      const mapKey = `${spec.scope}::${rowId}`;
      const prevAddr = XLSX.utils.encode_cell({ r, c: prevCol });
      sheet[prevAddr] = { t: "s", v: prevNotesByRow.get(mapKey) ?? "" };
      const newAddr = XLSX.utils.encode_cell({ r, c: newCol });
      sheet[newAddr] = { t: "s", v: clearNewNotes ? "" : cellValue(sheet[newAddr]?.v) };
    }
  }
}

export function writeNotesSheet(workbook: XLSX.WorkBook, rows: Record<string, string>[]): void {
  const header = [...NOTES_SHEET_COLUMNS];
  const data = [header, ...rows.map((row) => header.map((col) => row[col] ?? ""))];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  if (workbook.SheetNames.includes(NOTES_SHEET_NAME)) {
    workbook.Sheets[NOTES_SHEET_NAME] = sheet;
  } else {
    XLSX.utils.book_append_sheet(workbook, sheet, NOTES_SHEET_NAME);
  }
}

export function readEntityNewNotes(
  workbook: XLSX.WorkBook,
): Array<{ scope: string; rowKey: string; newNotesText: string }> {
  const results: Array<{ scope: string; rowKey: string; newNotesText: string }> = [];
  for (const spec of ENTITY_NOTE_SHEETS) {
    const rows = readSheetRows(workbook, spec.sheetName);
    for (const row of rows) {
      const rowKey = row[spec.idColumn] ?? row.id ?? "";
      const text = row[NEW_NOTES_COLUMN] ?? row.new_notes ?? "";
      if (!rowKey || !text.trim()) continue;
      results.push({ scope: spec.scope, rowKey, newNotesText: text });
    }
  }
  return results;
}

export function readEntityPrevNotes(
  workbook: XLSX.WorkBook,
): Array<{ scope: string; rowKey: string; prevNotesText: string }> {
  const results: Array<{ scope: string; rowKey: string; prevNotesText: string }> = [];
  for (const spec of ENTITY_NOTE_SHEETS) {
    const rows = readSheetRows(workbook, spec.sheetName);
    for (const row of rows) {
      const rowKey = row[spec.idColumn] ?? row.id ?? "";
      const text = row[PREV_NOTES_COLUMN] ?? row.prev_notes ?? "";
      if (!rowKey || !text.trim()) continue;
      results.push({ scope: spec.scope, rowKey, prevNotesText: text });
    }
  }
  return results;
}

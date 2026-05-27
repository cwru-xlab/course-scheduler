import type { NotesRowEntry, NotesSheetRow, RowNote, RowReply } from "@/lib/notes/types";
import type { NotesRowPatch } from "@/lib/notes/types";

function parseBool(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function cellStr(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function notesEntriesToSheetRows(entries: NotesRowEntry[]): NotesSheetRow[] {
  const rows: NotesSheetRow[] = [];

  for (const entry of entries) {
    const ordered = [...entry.notes].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );
    let seq = 0;
    for (const note of ordered) {
      seq += 1;
      rows.push({
        scope: entry.scope,
        row_key: entry.rowKey,
        note_id: note.id,
        parent_note_id: "",
        seq: String(seq),
        created_at: note.createdAt,
        author: note.author,
        completed: note.completed ? "TRUE" : "FALSE",
        body: note.note,
        source: "existing",
      });
      const replies = [...(note.replies ?? [])].sort(
        (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
      );
      for (const reply of replies) {
        seq += 1;
        rows.push({
          scope: entry.scope,
          row_key: entry.rowKey,
          note_id: reply.id,
          parent_note_id: note.id,
          seq: String(seq),
          created_at: reply.createdAt,
          author: reply.author,
          completed: "",
          body: reply.note,
          source: "existing",
        });
      }
    }
  }

  return rows;
}

export function sheetRowsToNotesByRow(rows: NotesSheetRow[]): Map<string, RowNote[]> {
  const replyRows: NotesSheetRow[] = [];
  const topLevel: NotesSheetRow[] = [];

  for (const row of rows) {
    if (!row.note_id || !row.scope || !row.row_key) continue;
    if (row.parent_note_id) replyRows.push(row);
    else topLevel.push(row);
  }

  const byRow = new Map<string, RowNote[]>();

  for (const row of topLevel) {
    const key = `${row.scope}::${row.row_key}`;
    const note: RowNote = {
      id: row.note_id,
      note: row.body,
      author: row.author,
      createdAt: row.created_at || new Date().toISOString(),
      completed: parseBool(row.completed),
      replies: [],
    };
    const list = byRow.get(key) ?? [];
    list.push(note);
    byRow.set(key, list);
  }

  for (const row of replyRows) {
    const key = `${row.scope}::${row.row_key}`;
    const notes = byRow.get(key);
    if (!notes) continue;
    const parent = notes.find((n) => n.id === row.parent_note_id);
    if (!parent) continue;
    const reply: RowReply = {
      id: row.note_id,
      note: row.body,
      author: row.author,
      createdAt: row.created_at || new Date().toISOString(),
    };
    parent.replies = [...(parent.replies ?? []), reply];
  }

  for (const [key, notes] of Array.from(byRow.entries())) {
    byRow.set(
      key,
      notes.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    );
  }

  return byRow;
}

export function parseNotesSheetFromRows(rawRows: Record<string, unknown>[]): NotesSheetRow[] {
  return rawRows
    .map((row) => ({
      scope: cellStr(row.scope),
      row_key: cellStr(row.row_key),
      note_id: cellStr(row.note_id),
      parent_note_id: cellStr(row.parent_note_id),
      seq: cellStr(row.seq),
      created_at: cellStr(row.created_at),
      author: cellStr(row.author),
      completed: cellStr(row.completed),
      body: cellStr(row.body),
      source: cellStr(row.source),
    }))
    .filter((r) => r.note_id && r.scope && r.row_key);
}

export function buildNotesPatches(
  sheetByRow: Map<string, RowNote[]>,
  newByRow: Map<string, RowNote[]>,
): NotesRowPatch[] {
  const keys = new Set([
    ...Array.from(sheetByRow.keys()),
    ...Array.from(newByRow.keys()),
  ]);
  const patches: NotesRowPatch[] = [];
  for (const key of Array.from(keys)) {
    const [scope, ...rest] = key.split("::");
    const rowKey = rest.join("::");
    patches.push({
      scope,
      rowKey,
      fromSheet: sheetByRow.get(key) ?? [],
      newNotes: newByRow.get(key) ?? [],
    });
  }
  return patches;
}

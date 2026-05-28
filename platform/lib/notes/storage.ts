import type { NotesImportSummary, NotesRowEntry, NotesRowPatch, RowNote } from "@/lib/notes/types";
import { NOTES_STORAGE_PREFIX, notesStorageKey } from "@/lib/notes/types";

export function parseStoredNotes(raw: string | null): RowNote[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RowNote[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((n) => ({ ...n, replies: n.replies ?? [] }));
  } catch {
    return [];
  }
}

export function collectAllRowNotes(): NotesRowEntry[] {
  if (typeof window === "undefined") return [];
  const entries: NotesRowEntry[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(NOTES_STORAGE_PREFIX)) continue;
    const parts = key.split("::");
    if (parts.length < 3) continue;
    const scope = parts[1];
    const rowKey = parts.slice(2).join("::");
    entries.push({
      scope,
      rowKey,
      notes: parseStoredNotes(localStorage.getItem(key)),
    });
  }
  return entries;
}

/** Notes with content only — used for export so empty storage keys do not wipe spreadsheet cells. */
export function collectRowNotesForExport(): NotesRowEntry[] {
  return collectAllRowNotes().filter((entry) => entry.notes.length > 0);
}

function noteTimestamp(note: RowNote): number {
  const t = Date.parse(note.createdAt);
  return Number.isNaN(t) ? 0 : t;
}

function sortNotesNewestFirst(notes: RowNote[]): RowNote[] {
  return [...notes].sort((a, b) => noteTimestamp(b) - noteTimestamp(a));
}

function mergeNotePreserveExisting(existing: RowNote, incoming: RowNote): RowNote {
  const replyById = new Map((existing.replies ?? []).map((r) => [r.id, r]));
  for (const reply of incoming.replies ?? []) {
    if (!replyById.has(reply.id)) replyById.set(reply.id, reply);
  }
  return {
    ...existing,
    note: existing.note || incoming.note,
    author: existing.author || incoming.author,
    createdAt: existing.createdAt || incoming.createdAt,
    completed: incoming.completed ?? existing.completed,
    replies: Array.from(replyById.values()).sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    ),
  };
}

/** Combine structured sheet notes and new_notes cell notes for one row (no prior state). */
export function combineImportRowNotes(patch: NotesRowPatch): RowNote[] {
  const byId = new Map<string, RowNote>();
  for (const note of patch.fromSheet) {
    byId.set(note.id, { ...note, replies: note.replies ?? [] });
  }
  for (const note of patch.newNotes) {
    if (!byId.has(note.id)) byId.set(note.id, note);
  }
  return sortNotesNewestFirst(Array.from(byId.values()));
}

export function mergeRowNotes(
  existing: RowNote[],
  fromSheet: RowNote[],
  newlyAdded: RowNote[],
): RowNote[] {
  const byId = new Map<string, RowNote>();
  for (const note of existing) byId.set(note.id, { ...note, replies: note.replies ?? [] });
  for (const note of fromSheet) {
    const prev = byId.get(note.id);
    byId.set(note.id, prev ? mergeNotePreserveExisting(prev, note) : note);
  }
  for (const note of newlyAdded) {
    if (!byId.has(note.id)) byId.set(note.id, note);
  }
  return sortNotesNewestFirst(Array.from(byId.values()));
}

function clearAllStoredNotes(): number {
  if (typeof window === "undefined") return 0;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(NOTES_STORAGE_PREFIX)) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
  return keys.length;
}

/**
 * Replace all row notes in localStorage with the spreadsheet import.
 * Notes not present in the import (including the Notes feed) are removed.
 */
export function applyNotesImportOverwriteToLocalStorage(
  patches: NotesRowPatch[],
): NotesImportSummary {
  if (typeof window === "undefined") {
    return {
      rowsUpdated: 0,
      notesAdded: 0,
      notesFromSheet: 0,
      repliesFromSheet: 0,
      notesRemoved: 0,
    };
  }

  const notesRemoved = clearAllStoredNotes();

  let rowsUpdated = 0;
  let notesAdded = 0;
  let notesFromSheet = 0;
  let repliesFromSheet = 0;

  for (const patch of patches) {
    notesAdded += patch.newNotes.length;
    for (const n of patch.fromSheet) {
      notesFromSheet += 1;
      repliesFromSheet += n.replies?.length ?? 0;
    }
    const notes = combineImportRowNotes(patch);
    if (notes.length === 0) continue;
    localStorage.setItem(
      notesStorageKey(patch.scope, patch.rowKey),
      JSON.stringify(notes),
    );
    rowsUpdated += 1;
  }

  window.dispatchEvent(new CustomEvent("wsom-notes-updated"));

  return { rowsUpdated, notesAdded, notesFromSheet, repliesFromSheet, notesRemoved };
}

export function formatNotesImportSummaryMessage(summary: NotesImportSummary): string {
  const parts: string[] = [];
  if (summary.notesRemoved > 0) {
    parts.push(`${summary.notesRemoved} previous note thread${summary.notesRemoved === 1 ? "" : "s"} cleared`);
  }
  const totalNotes = summary.notesFromSheet + summary.notesAdded;
  if (totalNotes > 0) {
    parts.push(`${totalNotes} note${totalNotes === 1 ? "" : "s"} loaded from spreadsheet`);
  } else if (summary.notesRemoved > 0) {
    parts.push("no notes in spreadsheet");
  }
  if (parts.length === 0) return "";
  return ` Notes: ${parts.join("; ")}.`;
}

/** @deprecated Use applyNotesImportOverwriteToLocalStorage — import always replaces notes. */
export const applyNotesImportToLocalStorage = applyNotesImportOverwriteToLocalStorage;

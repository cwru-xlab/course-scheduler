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

export function applyNotesImportToLocalStorage(patches: NotesRowPatch[]): NotesImportSummary {
  if (typeof window === "undefined") {
    return { rowsUpdated: 0, notesAdded: 0, notesFromSheet: 0, repliesFromSheet: 0 };
  }

  let rowsUpdated = 0;
  let notesAdded = 0;
  let notesFromSheet = 0;
  let repliesFromSheet = 0;

  for (const patch of patches) {
    const key = notesStorageKey(patch.scope, patch.rowKey);
    const existing = parseStoredNotes(localStorage.getItem(key));
    notesAdded += patch.newNotes.length;
    for (const n of patch.fromSheet) {
      notesFromSheet += 1;
      repliesFromSheet += n.replies?.length ?? 0;
    }
    const merged = mergeRowNotes(existing, patch.fromSheet, patch.newNotes);
    if (merged.length > 0) {
      localStorage.setItem(key, JSON.stringify(merged));
      rowsUpdated += 1;
    } else if (existing.length > 0) {
      localStorage.removeItem(key);
      rowsUpdated += 1;
    }
  }

  if (typeof window !== "undefined" && rowsUpdated > 0) {
    window.dispatchEvent(new CustomEvent("wsom-notes-updated"));
  }

  return { rowsUpdated, notesAdded, notesFromSheet, repliesFromSheet };
}

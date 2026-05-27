import type { RowNote, RowReply } from "@/lib/notes/types";

const NOTE_HEADER_RE =
  /^\[note_id=([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\](?:\[complete\])?\s*$/i;
const REPLY_HEADER_RE =
  /^\s+\[reply_id=([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\]\s*$/i;

/** Human-readable export for prev_notes cells (oldest → newest). */
export function formatPrevNotesDisplay(notes: RowNote[]): string {
  if (notes.length === 0) return "";

  const ordered = [...notes].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const blocks: string[] = [];

  for (const note of ordered) {
    const completeTag = note.completed ? "[complete]" : "";
    blocks.push(
      `[note_id=${note.id}][${note.createdAt}][${note.author}]${completeTag}`,
      note.note.trim(),
    );
    const replies = [...(note.replies ?? [])].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );
    for (const reply of replies) {
      blocks.push(
        `  [reply_id=${reply.id}][${reply.createdAt}][${reply.author}]`,
        `  ${reply.note.trim().replace(/\n/g, "\n  ")}`,
      );
    }
    blocks.push("");
  }

  return blocks.join("\n").trim();
}

/** Parse structured prev_notes text (fallback when Notes sheet is absent). */
export function parsePrevNotesDisplay(text: string): RowNote[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const notes: RowNote[] = [];
  let current: RowNote | null = null;
  let currentReply: RowReply | null = null;
  let bodyLines: string[] = [];

  const flushBody = () => {
    if (!current) return;
    const body = bodyLines.join("\n").trim();
    if (currentReply) {
      currentReply.note = body;
      current.replies = [...(current.replies ?? []), currentReply];
      currentReply = null;
    } else {
      current.note = body;
    }
    bodyLines = [];
  };

  const flushNote = () => {
    flushBody();
    if (current) {
      notes.push(current);
      current = null;
    }
  };

  for (const line of trimmed.split(/\r?\n/)) {
    const noteMatch = line.match(NOTE_HEADER_RE);
    if (noteMatch) {
      flushNote();
      current = {
        id: noteMatch[1].trim(),
        createdAt: noteMatch[2].trim(),
        author: noteMatch[3].trim(),
        completed: /\[complete\]/i.test(line),
        note: "",
        replies: [],
      };
      continue;
    }

    const replyMatch = line.match(REPLY_HEADER_RE);
    if (replyMatch && current) {
      flushBody();
      currentReply = {
        id: replyMatch[1].trim(),
        createdAt: replyMatch[2].trim(),
        author: replyMatch[3].trim(),
        note: "",
      };
      continue;
    }

    if (line.trim() === "" && bodyLines.length === 0) continue;
    bodyLines.push(line);
  }

  flushNote();
  return notes.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function splitNewNotesCell(text: string): string[] {
  const raw = text.trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n---\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function newNoteId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function newReplyId(): string {
  return `${Date.now()}-r-${Math.random().toString(36).slice(2, 7)}`;
}

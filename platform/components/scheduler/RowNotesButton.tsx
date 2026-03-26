"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@heroui/button";
import { Checkbox } from "@heroui/checkbox";
import { MessageSquare } from "lucide-react";

type RowNote = {
  id: string;
  note: string;
  author: string;
  completed: boolean;
  createdAt: string;
  replies?: RowReply[];
};

type RowReply = {
  id: string;
  note: string;
  author: string;
  createdAt: string;
};

type RowNotesButtonProps = {
  scope: string;
  rowId: string;
  title: string;
};

const storageKeyFor = (scope: string, rowId: string) =>
  `wsom-row-notes::${scope}::${rowId}`;

/** Query params written by the Notes Feed so we can open this modal on arrival. */
const OPEN_NOTES_QUERY = "openRowNotes";
const NOTE_SCOPE_QUERY = "noteScope";
const NOTE_ROW_QUERY = "noteRow";
const FOCUS_NOTE_QUERY = "focusNote";
const FOCUS_REPLY_QUERY = "focusReply";

/** Above sticky navbar (`z-50`); must not render inside table/card stacking contexts. */
const NOTES_MODAL_Z = 1000;
const NOTES_DELETE_MODAL_Z = 1100;

export const RowNotesButton = ({ scope, rowId, title }: RowNotesButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState<RowNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [authorDraft, setAuthorDraft] = useState("");
  const [pendingDeleteNote, setPendingDeleteNote] = useState<RowNote | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyAuthorDraft, setReplyAuthorDraft] = useState("");
  const pendingModalFocusRef = useRef<{ noteId: string; replyId?: string } | null>(null);
  /** Used to find `<tr>` / card container; `getElementById` alone is unreliable with some layouts. */
  const triggerWrapRef = useRef<HTMLSpanElement | null>(null);

  const storageKey = useMemo(() => storageKeyFor(scope, rowId), [scope, rowId]);
  /** Matches `id` on editor `<tr>` / cards (`note-${scope}-…`) for row highlight while modal is open. */
  const rowAnchorId = useMemo(
    () => `note-${scope}-${encodeURIComponent(rowId)}`,
    [scope, rowId],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const cls = "row-notes-open";
    if (!isOpen) return;

    const resolveHighlightHost = (): HTMLElement | null => {
      const byId = document.getElementById(rowAnchorId);
      if (byId) return byId;
      const root = triggerWrapRef.current;
      return root?.closest("tr") ?? root?.closest('[id^="note-"]') ?? null;
    };

    const apply = () => {
      const el = resolveHighlightHost();
      if (!el) return null;
      el.classList.add(cls);
      return el;
    };

    // After paint so `id` and refs are committed (helps strict mode / concurrent paths).
    let mounted: HTMLElement | null = null;
    const id = requestAnimationFrame(() => {
      mounted = apply();
    });
    return () => {
      cancelAnimationFrame(id);
      mounted?.classList.remove(cls);
    };
  }, [isOpen, rowAnchorId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setNotes([]);
        return;
      }
      const parsed = JSON.parse(raw) as RowNote[];
      const normalized = Array.isArray(parsed)
        ? parsed.map((n) => ({ ...n, replies: n.replies ?? [] }))
        : [];
      setNotes(normalized);
    } catch {
      setNotes([]);
    }
  }, [storageKey]);

  /** Notes Feed / deep links: open modal and optionally focus a note or reply. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get(OPEN_NOTES_QUERY) !== "1") return;
    if (sp.get(NOTE_SCOPE_QUERY) !== scope || sp.get(NOTE_ROW_QUERY) !== rowId) return;

    const focusNote = sp.get(FOCUS_NOTE_QUERY);
    const focusReply = sp.get(FOCUS_REPLY_QUERY);
    if (focusNote) {
      pendingModalFocusRef.current = {
        noteId: focusNote,
        replyId: focusReply || undefined,
      };
    }
    setIsOpen(true);

    sp.delete(OPEN_NOTES_QUERY);
    sp.delete(NOTE_SCOPE_QUERY);
    sp.delete(NOTE_ROW_QUERY);
    sp.delete(FOCUS_NOTE_QUERY);
    sp.delete(FOCUS_REPLY_QUERY);
    const q = sp.toString();
    const next = `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", next);
  }, [scope, rowId]);

  useEffect(() => {
    if (!isOpen) return;
    const pending = pendingModalFocusRef.current;
    if (!pending) return;
    const exists = notes.some((n) => n.id === pending.noteId);
    if (!exists) {
      pendingModalFocusRef.current = null;
      return;
    }
    setExpandedNoteId(pending.noteId);
    const { noteId, replyId } = pending;
    pendingModalFocusRef.current = null;

    const scrollTo = () => {
      const id = replyId ? `row-note-reply-${replyId}` : `row-note-thread-${noteId}`;
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    requestAnimationFrame(() => requestAnimationFrame(scrollTo));
  }, [isOpen, notes]);

  const persistNotes = (next: RowNote[]) => {
    setNotes(next);
    if (typeof window === "undefined") return;
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const addNote = () => {
    const note = noteDraft.trim();
    const author = authorDraft.trim();
    if (!note || !author) return;
    const next: RowNote[] = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        note,
        author,
        completed: false,
        createdAt: new Date().toISOString(),
        replies: [],
      },
      ...notes,
    ];
    persistNotes(next);
    setNoteDraft("");
    setAuthorDraft("");
  };

  const toggleCompleted = (id: string, value: boolean) => {
    const next = notes.map((n) => (n.id === id ? { ...n, completed: value } : n));
    persistNotes(next);
  };

  const deleteNote = (id: string) => {
    const next = notes.filter((n) => n.id !== id);
    persistNotes(next);
    setPendingDeleteNote(null);
    if (expandedNoteId === id) {
      setExpandedNoteId(null);
      setReplyDraft("");
      setReplyAuthorDraft("");
    }
  };

  const addReply = (noteId: string) => {
    const note = replyDraft.trim();
    const author = replyAuthorDraft.trim();
    if (!note || !author) return;
    const next = notes.map((n) =>
      n.id === noteId
        ? {
            ...n,
            replies: [
              ...(n.replies ?? []),
              {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                note,
                author,
                createdAt: new Date().toISOString(),
              },
            ],
          }
        : n,
    );
    persistNotes(next);
    setReplyDraft("");
    setReplyAuthorDraft("");
  };

  return (
    <>
      <span ref={triggerWrapRef} className="inline-flex">
        <Button
          size="sm"
          variant="light"
          onPress={() => setIsOpen(true)}
          className="text-xs font-semibold"
          startContent={<MessageSquare className="size-3.5" />}
        >
          View Notes ({notes.length})
        </Button>
      </span>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
            style={{ zIndex: NOTES_MODAL_Z }}
            role="presentation"
            onClick={() => setIsOpen(false)}
          >
            <div
              className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="row-notes-modal-title"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 id="row-notes-modal-title" className="text-lg font-black text-slate-900">
                {title}
              </h3>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="space-y-4 px-6 py-5 text-sm">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-500 mb-2">Existing notes</div>
                <div className="max-h-[45vh] overflow-y-auto space-y-2 pr-1">
                {notes.length === 0 ? (
                  <div className="text-slate-400 text-sm">No notes yet for this row.</div>
                ) : (
                  notes.map((n) => (
                    <div
                      key={n.id}
                      id={`row-note-thread-${n.id}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5"
                    >
                      <div className="flex items-start gap-2">
                        <Checkbox
                          isSelected={n.completed}
                          onValueChange={(v) => toggleCompleted(n.id, v)}
                          aria-label="Mark note complete"
                        />
                        <div className="min-w-0 flex-1">
                          <div className={n.completed ? "line-through text-slate-400" : "text-slate-800"}>
                            {n.note}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            Signed by {n.author} on {new Date(n.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start">
                          <Button
                            size="sm"
                            color="primary"
                            variant="flat"
                            className="h-7 min-w-0 px-2 text-[11px] font-semibold"
                            onPress={() =>
                              setExpandedNoteId((current) => (current === n.id ? null : n.id))
                            }
                          >
                            {expandedNoteId === n.id ? "Hide replies" : "Reply"}
                          </Button>
                          <Button
                            size="sm"
                            color="danger"
                            variant="light"
                            onPress={() => setPendingDeleteNote(n)}
                            className="h-7 min-w-0 px-2 text-[11px] font-semibold"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      {expandedNoteId === n.id && (
                        <div className="mt-3 border-t border-slate-200 pt-3 space-y-3">
                          <div className="text-xs font-semibold text-slate-500">
                            Replies ({n.replies?.length ?? 0})
                          </div>
                          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                            {(n.replies ?? []).length === 0 ? (
                              <div className="text-xs text-slate-400">No replies yet.</div>
                            ) : (
                              (n.replies ?? []).map((reply) => (
                                <div
                                  key={reply.id}
                                  id={`row-note-reply-${reply.id}`}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                                >
                                  <div className="text-sm text-slate-800">{reply.note}</div>
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    {reply.author} - {new Date(reply.createdAt).toLocaleString()}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <textarea
                              className="sm:col-span-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#137fec]"
                              rows={2}
                              value={replyDraft}
                              onChange={(e) => setReplyDraft(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              placeholder="Reply to this note..."
                            />
                            <textarea
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#137fec]"
                              rows={2}
                              value={replyAuthorDraft}
                              onChange={(e) => setReplyAuthorDraft(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              placeholder="Your name..."
                            />
                          </div>
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              color="primary"
                              variant="flat"
                              onPress={() => addReply(n.id)}
                              isDisabled={!replyDraft.trim() || !replyAuthorDraft.trim()}
                            >
                              Send reply
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-500 mb-2">Add a note</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <textarea
                    className="sm:col-span-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#137fec]"
                    rows={3}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Write your note..."
                  />
                  <textarea
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#137fec]"
                    rows={3}
                    value={authorDraft}
                    onChange={(e) => setAuthorDraft(e.target.value)}
                    placeholder="Sign off with your name..."
                  />
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    onPress={addNote}
                    isDisabled={!noteDraft.trim() || !authorDraft.trim()}
                  >
                    Save Note
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>,
          document.body,
        )}

      {pendingDeleteNote &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
            style={{ zIndex: NOTES_DELETE_MODAL_Z }}
            role="presentation"
            onClick={() => setPendingDeleteNote(null)}
          >
          <div
            className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <h4 className="text-base font-black text-slate-900">Delete note?</h4>
            </div>
            <div className="px-5 py-4 text-sm text-slate-700">
              This action cannot be undone.
              <div className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                "{pendingDeleteNote.note}"
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <Button size="sm" variant="light" onPress={() => setPendingDeleteNote(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                color="danger"
                onPress={() => deleteNote(pendingDeleteNote.id)}
              >
                Delete Note
              </Button>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
};


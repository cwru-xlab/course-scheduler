"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Reply } from "lucide-react";
import type { SchedulingInput } from "@/lib/scheduling/types";

type StoredReply = {
  id: string;
  note: string;
  author: string;
  createdAt: string;
};

type StoredRowNote = {
  id: string;
  note: string;
  author: string;
  completed: boolean;
  createdAt: string;
  replies?: StoredReply[];
};

type FeedItem = {
  id: string;
  kind: "note" | "reply";
  text: string;
  author: string;
  createdAt: string;
  scope: string;
  rowId: string;
  completed?: boolean;
  parentNoteId?: string;
};

type RowPreview = {
  title: string;
  fields: Array<{ label: string; value: string }>;
};

const STORAGE_PREFIX = "wsom-row-notes::";
const SCHEDULING_DATA_STORAGE_KEY = "wsom-scheduling-data";
const LAST_SOLVER_RUN_STORAGE_KEY = "wsom-last-solver-run";

const scopeToRoute: Record<string, string> = {
  sections: "/editor/sections",
  instructors: "/editor/instructors",
  rooms: "/editor/rooms",
  timeslots: "/editor/timeslots",
  "meeting-patterns": "/editor/meeting-patterns",
  "constraints-crosslist-groups": "/editor/constraints",
  "constraints-no-overlap-groups": "/editor/constraints",
  "constraints-blocked-times": "/editor/constraints",
  "constraints-locked-assignments": "/editor/constraints",
  "constraints-soft-locks": "/editor/constraints",
};

const scopeToLabel: Record<string, string> = {
  sections: "Sections",
  instructors: "Instructors",
  rooms: "Rooms",
  timeslots: "Timeslots",
  "meeting-patterns": "Meeting Patterns",
  "constraints-crosslist-groups": "Constraints: Cross-List Groups",
  "constraints-no-overlap-groups": "Constraints: No-Overlap Groups",
  "constraints-blocked-times": "Constraints: Blocked Times",
  "constraints-locked-assignments": "Constraints: Locked Assignments",
  "constraints-soft-locks": "Constraints: Soft Locks",
};

/** Opens the row's notes modal on the editor page and focuses the feed item's note/reply. */
function editorHrefWithNotesModal(item: FeedItem): string {
  const route = scopeToRoute[item.scope] ?? "/editor/sections";
  const anchorId = `note-${item.scope}-${encodeURIComponent(item.rowId)}`;
  const params = new URLSearchParams();
  params.set("openRowNotes", "1");
  params.set("noteScope", item.scope);
  params.set("noteRow", item.rowId);
  if (item.kind === "note") {
    const noteId = item.id.startsWith("note-") ? item.id.slice("note-".length) : item.id;
    params.set("focusNote", noteId);
  } else if (item.parentNoteId) {
    params.set("focusNote", item.parentNoteId);
    const replyId = item.id.startsWith("reply-") ? item.id.slice("reply-".length) : item.id;
    params.set("focusReply", replyId);
  }
  return `${route}?${params.toString()}#${anchorId}`;
}

export default function NotesFeedPage() {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [scheduleData, setScheduleData] = useState<SchedulingInput | null>(null);
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  const [filterScope, setFilterScope] = useState<string>("all");
  const [filterAuthor, setFilterAuthor] = useState<string>("all");
  const [filterKind, setFilterKind] = useState<"all" | "note" | "reply">("all");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const items: FeedItem[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      const parts = key.split("::");
      if (parts.length < 3) continue;
      const scope = parts[1];
      const rowId = parts.slice(2).join("::");
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const notes = JSON.parse(raw) as StoredRowNote[];
        if (!Array.isArray(notes)) continue;
        for (const n of notes) {
          items.push({
            id: `note-${n.id}`,
            kind: "note",
            text: n.note,
            author: n.author,
            createdAt: n.createdAt,
            completed: n.completed,
            scope,
            rowId,
          });
          for (const r of n.replies ?? []) {
            items.push({
              id: `reply-${r.id}`,
              kind: "reply",
              text: r.note,
              author: r.author,
              createdAt: r.createdAt,
              parentNoteId: n.id,
              scope,
              rowId,
            });
          }
        }
      } catch {
        // Ignore malformed local notes payloads.
      }
    }
    items.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    setFeedItems(items);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawDraft = localStorage.getItem(SCHEDULING_DATA_STORAGE_KEY);
      if (rawDraft) {
        const parsedDraft = JSON.parse(rawDraft) as SchedulingInput;
        setScheduleData(parsedDraft);
        return;
      }
    } catch {
      // Fall through to other local source.
    }

    try {
      const rawRun = localStorage.getItem(LAST_SOLVER_RUN_STORAGE_KEY);
      if (rawRun) {
        const parsedRun = JSON.parse(rawRun) as { input?: SchedulingInput };
        if (parsedRun?.input) {
          setScheduleData(parsedRun.input);
        }
      }
    } catch {
      // Feed still works without row preview details.
    }
  }, []);

  const groupedCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of feedItems) {
      map.set(item.scope, (map.get(item.scope) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [feedItems]);

  const filteredFeedItems = useMemo(() => {
    return feedItems.filter((item) => {
      if (filterScope !== "all" && item.scope !== filterScope) return false;
      if (filterAuthor !== "all" && item.author !== filterAuthor) return false;
      if (filterKind !== "all" && item.kind !== filterKind) return false;
      return true;
    });
  }, [feedItems, filterScope, filterAuthor, filterKind]);

  const filteredGroupedCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of filteredFeedItems) {
      map.set(item.scope, (map.get(item.scope) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredFeedItems]);

  const uniqueAuthors = useMemo(() => {
    const set = new Set<string>();
    for (const item of feedItems) set.add(item.author);
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [feedItems]);

  const getIndexFromRowId = (rowId: string): number | null => {
    const lastDash = rowId.lastIndexOf("-");
    if (lastDash === -1) return null;
    const maybeIndex = parseInt(rowId.slice(lastDash + 1), 10);
    return Number.isFinite(maybeIndex) ? maybeIndex : null;
  };

  useEffect(() => {
    if (!selectedItem) return;
    const stillVisible = filteredFeedItems.some((i) => i.id === selectedItem.id);
    if (!stillVisible) setSelectedItem(null);
  }, [filteredFeedItems, selectedItem]);

  const buildRowPreview = (item: FeedItem, data: SchedulingInput | null): RowPreview | null => {
    if (!data) return null;
    switch (item.scope) {
      case "sections": {
        const row = data.sections.find((s) => String(s.id) === item.rowId);
        if (!row) return null;
        return {
          title: `Section ${row.id}`,
          fields: [
            { label: "Department", value: String((row as { department?: string }).department ?? "N/A") },
            { label: "Course ID", value: String(row.course_id) },
            { label: "Section Code", value: String(row.section_code) },
            { label: "Instructor ID", value: String(row.instructor_id) },
            { label: "Enrollment Cap", value: String(row.enrollment_cap ?? "N/A") },
          ],
        };
      }
      case "instructors": {
        const row = data.instructors.find((s) => String(s.id) === item.rowId);
        if (!row) return null;
        return {
          title: `Instructor ${row.id}`,
          fields: [
            { label: "Name", value: String(row.name ?? row.id) },
            { label: "Rank", value: String(row.rank_type ?? "N/A") },
            {
              label: "Preferred Days",
              value: row.preferences?.preferred_days?.join(", ") || "N/A",
            },
            {
              label: "Max Days",
              value: String(row.preferences?.max_teaching_days ?? "N/A"),
            },
          ],
        };
      }
      case "rooms": {
        const row = data.rooms.find((s) => String(s.id) === item.rowId);
        if (!row) return null;
        return {
          title: `Room ${row.id}`,
          fields: [
            { label: "Building", value: String(row.building ?? "N/A") },
            { label: "Room #", value: String((row as { room_number?: string }).room_number ?? "N/A") },
            { label: "Capacity", value: String(row.capacity ?? "N/A") },
          ],
        };
      }
      case "timeslots": {
        const row = data.timeslots.find((s) => String(s.id) === item.rowId);
        if (!row) return null;
        return {
          title: `Timeslot ${row.id}`,
          fields: [
            { label: "Day(s)", value: String(row.day ?? "N/A") },
            { label: "Start", value: String(row.start_time ?? "N/A") },
            { label: "End", value: String(row.end_time ?? "N/A") },
          ],
        };
      }
      case "meeting-patterns": {
        const row = data.meeting_patterns.find((s) => String(s.id) === item.rowId);
        if (!row) return null;
        return {
          title: `Meeting Pattern ${row.id}`,
          fields: [
            { label: "Slots Required", value: String(row.slots_required ?? "N/A") },
            { label: "Allowed Days", value: row.allowed_days?.join(", ") || "N/A" },
          ],
        };
      }
      case "constraints-crosslist-groups": {
        const row = data.crosslist_groups.find((s) => String(s.id) === item.rowId);
        if (!row) return null;
        return {
          title: `Cross-List Group ${row.id}`,
          fields: [
            { label: "Members", value: row.member_section_ids?.join(", ") || "N/A" },
            { label: "Require Same Room", value: row.require_same_room ? "Yes" : "No" },
          ],
        };
      }
      case "constraints-no-overlap-groups": {
        const row = data.no_overlap_groups.find((s) => String(s.id) === item.rowId);
        if (!row) return null;
        return {
          title: `No-Overlap Group ${row.id}`,
          fields: [
            { label: "Members", value: row.member_section_ids?.join(", ") || "N/A" },
            { label: "Reason", value: row.reason || "N/A" },
          ],
        };
      }
      case "constraints-blocked-times": {
        const idx = getIndexFromRowId(item.rowId);
        if (idx === null) return null;
        const row = data.blocked_times[idx];
        if (!row) return null;
        return {
          title: `Blocked Time Row ${idx + 1}`,
          fields: [
            { label: "Scope", value: String(row.scope ?? "N/A") },
            { label: "Days", value: row.days || "N/A" },
            { label: "Start", value: row.start_time || "N/A" },
            { label: "End", value: row.end_time || "N/A" },
            { label: "Reason", value: row.reason || "N/A" },
          ],
        };
      }
      case "constraints-locked-assignments": {
        const idx = getIndexFromRowId(item.rowId);
        if (idx === null) return null;
        const row = data.locked_assignments[idx];
        if (!row) return null;
        return {
          title: `Locked Assignment Row ${idx + 1}`,
          fields: [
            { label: "Section", value: row.section_id || "N/A" },
            { label: "Fixed Timeslots", value: row.fixed_timeslot_set?.join(", ") || "N/A" },
            { label: "Fixed Room", value: row.fixed_room || "N/A" },
          ],
        };
      }
      case "constraints-soft-locks": {
        const idx = getIndexFromRowId(item.rowId);
        if (idx === null) return null;
        const row = data.soft_locks[idx];
        if (!row) return null;
        return {
          title: `Soft Lock Row ${idx + 1}`,
          fields: [
            { label: "Section", value: row.section_id || "N/A" },
            {
              label: "Preferred Timeslots",
              value: row.preferred_timeslot_set?.join(", ") || "N/A",
            },
            { label: "Preferred Room", value: row.preferred_room || "N/A" },
            { label: "Weight", value: String(row.weight ?? "N/A") },
          ],
        };
      }
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Recent Notes & Replies</h1>
          <p className="text-slate-500 mt-1">
            Activity feed ordered by recency. Open a note to view row details; use the link to jump to the editor
            with that row&apos;s notes modal open.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Table
            </div>
            <select
              value={filterScope}
              onChange={(e) => setFilterScope(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-weatherhead-primary/25"
            >
              <option value="all">All tables</option>
              {groupedCount.map(([scope]) => (
                <option key={scope} value={scope}>
                  {scopeToLabel[scope] ?? scope}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              User
            </div>
            <select
              value={filterAuthor}
              onChange={(e) => setFilterAuthor(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-weatherhead-primary/25"
            >
              <option value="all">All users</option>
              {uniqueAuthors.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Notes vs Replies
            </div>
            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as "all" | "note" | "reply")}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-weatherhead-primary/25"
            >
              <option value="all">All</option>
              <option value="note">Notes</option>
              <option value="reply">Replies</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex flex-wrap gap-2">
            {filteredGroupedCount.length === 0 ? (
              <span className="text-sm text-slate-400">No notes match filters.</span>
            ) : (
              filteredGroupedCount.map(([scope, count]) => (
                <span
                  key={scope}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600"
                >
                  {scopeToLabel[scope] ?? scope}: {count}
                </span>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setFilterScope("all");
              setFilterAuthor("all");
              setFilterKind("all");
            }}
            className="text-xs font-semibold text-slate-600 hover:text-weatherhead-primary transition-colors"
            disabled={filterScope === "all" && filterAuthor === "all" && filterKind === "all"}
          >
            Clear filters
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {filteredFeedItems.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400">
            No recent note activity found for the selected filters.
          </div>
        ) : (
          filteredFeedItems.map((item) => {
            const href = editorHrefWithNotesModal(item);
            return (
              <div
                key={item.id}
                className="relative rounded-xl border border-slate-200 bg-white p-4 hover:border-[#137fec]/40 hover:bg-[#137fec]/[0.03] transition-colors"
                onClick={() => setSelectedItem(item)}
              >
                {item.kind === "note" && typeof item.completed === "boolean" && (
                  <div className="absolute top-3 right-3 z-0 pointer-events-none">
                    <span
                      className={[
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
                        item.completed
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-amber-50 border-amber-200 text-amber-700",
                      ].join(" ")}
                    >
                      {item.completed ? "Completed" : "Open"}
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-slate-500">
                    {item.kind === "reply" ? (
                      <Reply className="size-4" />
                    ) : (
                      <MessageSquare className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">
                        {scopeToLabel[item.scope] ?? item.scope}
                      </span>
                      <span>-</span>
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                      <span>-</span>
                      <span>{item.author}</span>
                    </div>
                    <div
                      className="mt-1 text-sm text-slate-800 line-clamp-2"
                      title="View row details"
                    >
                      {item.text}
                    </div>
                    <div className="mt-2">
                      <Link
                        href={href}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] text-[#137fec] font-semibold hover:underline"
                      >
                        Open notes for this row
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedItem && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-black text-slate-900">Linked Row Details</h3>
              <button
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                onClick={() => setSelectedItem(null)}
              >
                Close
              </button>
            </div>
            <div className="space-y-4 px-6 py-5 text-sm">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Feed item
                </div>
                <div className="mt-2 text-slate-800">{selectedItem.text}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {scopeToLabel[selectedItem.scope] ?? selectedItem.scope} -{" "}
                  {new Date(selectedItem.createdAt).toLocaleString()} - {selectedItem.author}
                </div>
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Referenced row
                </div>
                {(() => {
                  const preview = buildRowPreview(selectedItem, scheduleData);
                  if (!preview) {
                    return (
                      <div className="mt-2 text-slate-500">
                        Row details unavailable. You can still open the linked row directly.
                      </div>
                    );
                  }
                  return (
                    <div className="mt-2 rounded-lg border border-slate-200 p-3">
                      <div className="font-semibold text-slate-900">{preview.title}</div>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {preview.fields.map((f) => (
                          <div key={f.label} className="text-slate-700">
                            <span className="font-semibold">{f.label}:</span> {f.value}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="flex justify-end">
                <Link
                  href={editorHrefWithNotesModal(selectedItem)}
                  className="rounded-lg bg-[#137fec] px-4 py-2 text-white text-sm font-bold hover:opacity-90"
                >
                  Open notes for this row
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


"use client";

import { useMemo, useState, type RefObject } from "react";
import clsx from "clsx";
import { AlertTriangle, Archive, ChevronLeft, ChevronRight, GripVertical, Layers } from "lucide-react";

import { formatCalendarSectionHoverLines } from "./calendarEvents";
import { setCalendarDragImage } from "./calendarDragGhost";
import { isSectionArchived } from "@/lib/scheduling/sectionState";
import { isQueuedSection } from "@/lib/scheduling/sectionOnline";

export type QueueSectionRow = {
  id: string;
  department?: string | null;
  course_id: string | number;
  section_code: string;
  section_number?: string;
  instructor_id: string;
  instructorName: string;
  allowed_meeting_patterns?: string[];
  state?: string | null;
  assignment?: { room_id?: string; timeslot_ids?: string[]; meeting_pattern_id?: string };
  room_id?: string | null;
  timeslot_id?: string | null;
  previous_meeting_pattern?: string | null;
  isGhost?: boolean;
  patternInvalid?: boolean;
};

type SectionQueueSidebarProps = {
  open: boolean;
  onToggleOpen: () => void;
  sections: QueueSectionRow[];
  patternInvalidSectionIds: Set<string>;
  ghostSectionIds: Set<string>;
  activeDragSectionId: string | null;
  onBeginPlace: (sectionId: string) => void;
  onDropUnplace: (sectionId: string) => void;
  dropZoneRef?: RefObject<HTMLDivElement | null>;
};

type QueueTab = "unscheduled" | "archived";
type QueueSort = "course" | "pattern";

export function SectionQueueSidebar({
  open,
  onToggleOpen,
  sections,
  patternInvalidSectionIds,
  ghostSectionIds,
  activeDragSectionId,
  onBeginPlace,
  onDropUnplace,
  dropZoneRef,
}: SectionQueueSidebarProps) {
  const [tab, setTab] = useState<QueueTab>("unscheduled");
  const [search, setSearch] = useState("");
  const [patternFilter, setPatternFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<QueueSort>("course");
  const [dragOver, setDragOver] = useState(false);

  const enriched = useMemo(
    () =>
      sections.map((s) => ({
        ...s,
        patternInvalid: patternInvalidSectionIds.has(s.id),
        isGhost: ghostSectionIds.has(s.id),
        queued: isQueuedSection(s, s.assignment ?? null),
      })),
    [sections, patternInvalidSectionIds, ghostSectionIds],
  );

  const patternOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of enriched) {
      if (!s.queued || isSectionArchived(s)) continue;
      for (const p of s.allowed_meeting_patterns ?? []) {
        if (p.trim()) set.add(p.trim());
      }
      const persisted = String(s.previous_meeting_pattern ?? "").trim();
      if (persisted) set.add(persisted);
    }
    return Array.from(set).sort();
  }, [enriched]);

  const filtered = useMemo(() => {
    const primaryPatternLabel = (row: (typeof enriched)[number]): string => {
      const allowed = (row.allowed_meeting_patterns ?? []).map((p) => p.trim()).filter(Boolean);
      if (allowed.length > 0) return allowed[0];
      const fromAssignment = String(row.assignment?.meeting_pattern_id ?? "").trim();
      if (fromAssignment) return fromAssignment;
      const fromPersisted = String(row.previous_meeting_pattern ?? "").trim();
      return fromPersisted || "—";
    };

    const q = search.trim().toLowerCase();
    let rows = enriched;
    if (tab === "unscheduled") {
      rows = rows.filter((s) => s.queued && !isSectionArchived(s));
    } else if (tab === "archived") {
      rows = rows.filter((s) => isSectionArchived(s));
    }
    if (tab === "unscheduled" && patternFilter) {
      rows = rows.filter((s) => (s.allowed_meeting_patterns ?? []).includes(patternFilter));
    }
    if (q) {
      rows = rows.filter((s) => {
        const label = formatCalendarSectionHoverLines(s, s.instructorName).title.toLowerCase();
        return (
          label.includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.instructorName.toLowerCase().includes(q)
        );
      });
    }
    return [...rows].sort((a, b) => {
      if (a.patternInvalid !== b.patternInvalid) return a.patternInvalid ? -1 : 1;
      if (tab === "unscheduled" && sortBy === "pattern") {
        const patternCmp = primaryPatternLabel(a).localeCompare(
          primaryPatternLabel(b),
          undefined,
          { sensitivity: "base" },
        );
        if (patternCmp !== 0) return patternCmp;
      }
      const la = formatCalendarSectionHoverLines(a, a.instructorName).title;
      const lb = formatCalendarSectionHoverLines(b, b.instructorName).title;
      return la.localeCompare(lb, undefined, { sensitivity: "base" });
    });
  }, [enriched, tab, search, patternFilter, sortBy]);

  const patternInvalidCount = enriched.filter((s) => s.patternInvalid).length;

  return (
    <div
      className={clsx(
        "relative flex shrink-0 transition-[width] duration-300 ease-out",
        open ? "w-72" : "w-10",
      )}
    >
      <button
        type="button"
        className="absolute -right-3 top-4 z-20 flex size-6 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm text-slate-600 hover:bg-slate-50"
        onClick={onToggleOpen}
        aria-label={open ? "Collapse section queue" : "Expand section queue"}
      >
        {open ? <ChevronLeft className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>

      <aside
        className={clsx(
          "flex h-full min-h-0 flex-col border-r border-slate-200 bg-white shadow-sm",
          !open && "overflow-hidden",
        )}
      >
        {open ? (
          <>
            <div className="border-b border-slate-200 px-3 py-3">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-700">
                Section queue
              </h2>
              {patternInvalidCount > 0 ? (
                <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-800">
                  <AlertTriangle className="size-3 shrink-0" />
                  {patternInvalidCount} unplaced (pattern changed)
                </p>
              ) : null}
            </div>

            <div className="flex gap-1 border-b border-slate-200 px-2 py-2">
              {(
                [
                  ["unscheduled", "Unscheduled"],
                  ["archived", "Archived"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={clsx(
                    "flex-1 rounded-md px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                    tab === id
                      ? "bg-sky-100 text-sky-800"
                      : "text-slate-500 hover:bg-slate-50",
                  )}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-2 border-b border-slate-200 px-2 py-2">
              <input
                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                placeholder="Search queue…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {tab === "unscheduled" ? (
                <div className="flex gap-1.5">
                  <select
                    className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
                    value={patternFilter}
                    onChange={(e) => setPatternFilter(e.target.value)}
                    aria-label="Filter by meeting pattern"
                  >
                    <option value="">All patterns</option>
                    {patternOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-[5.5rem] shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-1.5 text-xs"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as QueueSort)}
                    aria-label="Sort queue"
                  >
                    <option value="course">By course</option>
                    <option value="pattern">By pattern</option>
                  </select>
                </div>
              ) : null}
            </div>

            <div
              ref={dropZoneRef}
              data-queue-drop-zone="true"
              className={clsx(
                "mx-2 mb-2 rounded-lg border-2 border-dashed px-2 py-3 text-center text-[10px] font-semibold transition-colors",
                dragOver
                  ? "border-sky-400 bg-sky-50 text-sky-800"
                  : "border-slate-200 text-slate-500",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const sectionId = e.dataTransfer.getData("text/section-id");
                if (sectionId) onDropUnplace(sectionId);
              }}
            >
              Drop here to unplace
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 space-y-1.5">
              {filtered.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-slate-400">No sections</p>
              ) : (
                filtered.map((row) => {
                  const { title, instructor } = formatCalendarSectionHoverLines(
                    row,
                    row.instructorName,
                  );
                  const active = activeDragSectionId === row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      draggable
                      data-queue-section-row="true"
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/section-id", row.id);
                        e.dataTransfer.effectAllowed = "move";
                        const card = e.currentTarget;
                        setCalendarDragImage(e.nativeEvent, card, { width: 200, offsetY: 20 });
                        onBeginPlace(row.id);
                      }}
                      onClick={() => onBeginPlace(row.id)}
                      className={clsx(
                        "flex w-full items-start gap-2 rounded-lg border px-2 py-2 text-left transition-colors",
                        active
                          ? "border-sky-400 bg-sky-50 ring-2 ring-sky-200"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                        row.patternInvalid && "border-amber-300 bg-amber-50/80",
                      )}
                    >
                      <GripVertical className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-bold text-slate-900">{title}</div>
                        <div className="truncate text-[10px] text-slate-500">{instructor}</div>
                        {row.patternInvalid ? (
                          <div className="mt-1 flex items-center gap-1 text-[9px] font-semibold text-amber-800">
                            <AlertTriangle className="size-3" />
                            Pattern no longer allowed
                          </div>
                        ) : null}
                        {row.isGhost ? (
                          <div className="mt-1 text-[9px] font-semibold text-rose-700">
                            Removed from editor (kept on calendar)
                          </div>
                        ) : null}
                        {isSectionArchived(row) ? (
                          <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-500">
                            <Archive className="size-3" />
                            Archived
                          </div>
                        ) : null}
                        {(row.allowed_meeting_patterns?.length ?? 0) > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(row.allowed_meeting_patterns ?? []).slice(0, 3).map((p) => (
                              <span
                                key={p}
                                className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 py-0.5 text-[8px] font-semibold text-slate-600"
                              >
                                <Layers className="size-2.5" />
                                {p}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center py-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 [writing-mode:vertical-rl] rotate-180">
              Queue
            </span>
          </div>
        )}
      </aside>
    </div>
  );
}

"use client";

import { useMemo, useRef, useState, type DragEvent, type RefObject } from "react";
import clsx from "clsx";
import { AlertTriangle, Archive, ChevronDown, ChevronLeft, ChevronRight, Filter, GripVertical, Layers, Pencil } from "lucide-react";

import { formatCalendarSectionHoverLines } from "./calendarEvents";
import { setCalendarDragImage } from "./calendarDragGhost";
import type { EditorInvalidatedPlacement, EditorInvalidationReason } from "@/lib/scheduling/mergeEditorIntoSnapshot";
import { isSectionArchived } from "@/lib/scheduling/sectionState";
import { isQueuedSection, primaryPatternForSection, sectionMatchesPatternFilter } from "@/lib/scheduling/sectionOnline";
import { TermBadge } from "@/components/calendar/TermBadge";
import { normalizeSectionTerm, SECTION_TERM_LABELS, termBadgeLabel } from "@/lib/scheduling/sectionTerm";

export type QueueSectionRow = {
  id: string;
  department?: string | null;
  course_id: string | number;
  section_code: string;
  section_number?: string;
  instructor_id: string;
  instructorName: string;
  allowed_meeting_patterns?: string[];
  tags?: string[];
  term?: string;
  state?: string | null;
  assignment?: { room_id?: string; timeslot_ids?: string[]; meeting_pattern_id?: string; assigned_half?: string | null };
  room_id?: string | null;
  timeslot_id?: string | null;
  previous_meeting_pattern?: string | null;
  isGhost?: boolean;
  editorInvalidation?: EditorInvalidatedPlacement | null;
};

type SectionQueueSidebarProps = {
  open: boolean;
  onToggleOpen: () => void;
  onRequestOpen?: () => void;
  sidebarRef?: RefObject<HTMLDivElement | null>;
  sections: QueueSectionRow[];
  editorInvalidatedPlacements: Map<string, EditorInvalidatedPlacement>;
  ghostSectionIds: Set<string>;
  activeDragSectionId: string | null;
  onBeginPlace: (sectionId: string) => void;
  onEditSection: (sectionId: string) => void;
  onPlacementDragEnd?: () => void;
  onDropUnplace: (sectionId: string) => void;
};

type QueueTab = "unscheduled" | "archived";
type QueueSort = "course" | "pattern";

function invalidationLabel(reason: EditorInvalidationReason): string {
  switch (reason) {
    case "pattern":
      return "Pattern no longer allowed — fix in editor";
    case "capacity":
      return "Enrollment exceeds room capacity";
    case "room_requirements":
      return "Assigned room missing required features";
    default:
      return "Placement invalidated by editor change";
  }
}

export function SectionQueueSidebar({
  open,
  onToggleOpen,
  onRequestOpen,
  sidebarRef,
  sections,
  editorInvalidatedPlacements,
  ghostSectionIds,
  activeDragSectionId,
  onBeginPlace,
  onEditSection,
  onPlacementDragEnd,
  onDropUnplace,
}: SectionQueueSidebarProps) {
  const [tab, setTab] = useState<QueueTab>("unscheduled");
  const [search, setSearch] = useState("");
  const [patternFilter, setPatternFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [termFilter, setTermFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<QueueSort>("course");
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const suppressRowClickRef = useRef(false);

  const enriched = useMemo(
    () =>
      sections.map((s) => ({
        ...s,
        editorInvalidation: editorInvalidatedPlacements.get(s.id) ?? s.editorInvalidation ?? null,
        isGhost: ghostSectionIds.has(s.id),
        queued: isQueuedSection(s, s.assignment ?? null),
      })),
    [sections, editorInvalidatedPlacements, ghostSectionIds],
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

  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of enriched) {
      for (const t of s.tags ?? []) {
        if (t.trim()) set.add(t.trim());
      }
    }
    return Array.from(set).sort();
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = enriched;
    if (tab === "unscheduled") {
      rows = rows.filter((s) => s.queued && !isSectionArchived(s) && !s.isGhost);
      if (needsAttentionOnly) {
        rows = rows.filter((s) => Boolean(s.editorInvalidation));
      }
    } else if (tab === "archived") {
      rows = rows.filter((s) => isSectionArchived(s));
    }
    if (tagFilter) {
      rows = rows.filter((s) => (s.tags ?? []).includes(tagFilter));
    }
    if (termFilter) {
      rows = rows.filter((s) => normalizeSectionTerm(s.term) === termFilter);
    }
    if (tab === "unscheduled" && patternFilter) {
      rows = rows.filter((s) => sectionMatchesPatternFilter(s, patternFilter));
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
      const aInvalid = Boolean(a.editorInvalidation);
      const bInvalid = Boolean(b.editorInvalidation);
      if (aInvalid !== bInvalid) return aInvalid ? -1 : 1;
      if (tab === "unscheduled" && sortBy === "pattern") {
        const patternCmp = primaryPatternForSection(a).localeCompare(
          primaryPatternForSection(b),
          undefined,
          { sensitivity: "base" },
        );
        if (patternCmp !== 0) return patternCmp;
      }
      const la = formatCalendarSectionHoverLines(a, a.instructorName).title;
      const lb = formatCalendarSectionHoverLines(b, b.instructorName).title;
      return la.localeCompare(lb, undefined, { sensitivity: "base" });
    });
  }, [enriched, tab, search, patternFilter, tagFilter, termFilter, sortBy, needsAttentionOnly]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (tagFilter) count += 1;
    if (termFilter) count += 1;
    if (tab !== "unscheduled") return count;
    if (patternFilter) count += 1;
    if (sortBy !== "course") count += 1;
    if (needsAttentionOnly) count += 1;
    return count;
  }, [tab, patternFilter, tagFilter, termFilter, sortBy, needsAttentionOnly]);

  const clearFilters = () => {
    setPatternFilter("");
    setTagFilter("");
    setTermFilter("");
    setSortBy("course");
    setNeedsAttentionOnly(false);
  };

  const invalidatedCount = enriched.filter((s) => s.editorInvalidation).length;

  const handleUnplaceDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("text/section-id")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
    if (!open) onRequestOpen?.();
  };

  const handleUnplaceDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  };

  const handleUnplaceDrop = (e: DragEvent) => {
    const sectionId = e.dataTransfer.getData("text/section-id");
    if (!sectionId) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    onDropUnplace(sectionId);
  };

  return (
    <div
      ref={sidebarRef}
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
          "flex h-full w-full min-w-0 flex-col overflow-x-hidden border-r border-slate-200 bg-white shadow-sm",
          !open && "overflow-hidden",
          dragOver && "bg-sky-50 ring-2 ring-inset ring-sky-300",
        )}
        onDragEnterCapture={handleUnplaceDragOver}
        onDragOverCapture={handleUnplaceDragOver}
        onDragLeave={handleUnplaceDragLeave}
        onDropCapture={handleUnplaceDrop}
      >
        {open ? (
          <>
            <div className="border-b border-slate-200 px-3 py-3">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-700">
                Section queue
              </h2>
              {dragOver ? (
                <p className="mt-1 text-[10px] font-semibold text-sky-700">
                  Release anywhere in the queue to unplace
                </p>
              ) : null}
              {invalidatedCount > 0 ? (
                <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-800">
                  <AlertTriangle className="size-3 shrink-0" />
                  {invalidatedCount} need attention after editor changes
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

            <div className="min-w-0 space-y-2 border-b border-slate-200 px-2 py-2">
              <input
                className="w-full min-w-0 rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                placeholder="Search queue…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {(tab === "unscheduled" || tab === "archived") ? (
                <>
                  <button
                    type="button"
                    className={clsx(
                      "flex w-full min-w-0 items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors",
                      filtersExpanded || activeFilterCount > 0
                        ? "border-sky-200 bg-sky-50/80 text-sky-900"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50",
                    )}
                    aria-expanded={filtersExpanded}
                    onClick={() => setFiltersExpanded((open) => !open)}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Filter className="size-3.5 shrink-0" aria-hidden />
                      <span>Filters</span>
                      {activeFilterCount > 0 ? (
                        <span className="rounded-full bg-sky-200 px-1.5 py-0.5 text-[9px] font-bold leading-none text-sky-900">
                          {activeFilterCount}
                        </span>
                      ) : null}
                    </span>
                    <ChevronDown
                      className={clsx(
                        "size-3.5 shrink-0 text-slate-500 transition-transform",
                        filtersExpanded && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>
                  {filtersExpanded ? (
                    <div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50/60 p-2">
                      <div>
                        <label
                          htmlFor="queue-tag-filter"
                          className="mb-0.5 block text-[10px] font-semibold text-slate-500"
                        >
                          Tag
                        </label>
                        <select
                          id="queue-tag-filter"
                          className="min-w-0 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          value={tagFilter}
                          onChange={(e) => setTagFilter(e.target.value)}
                        >
                          <option value="">All tags</option>
                          {tagOptions.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="queue-term-filter"
                          className="mb-0.5 block text-[10px] font-semibold text-slate-500"
                        >
                          Term
                        </label>
                        <select
                          id="queue-term-filter"
                          className="min-w-0 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
                          value={termFilter}
                          onChange={(e) => setTermFilter(e.target.value)}
                        >
                          <option value="">All terms</option>
                          {Object.entries(SECTION_TERM_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {tab === "unscheduled" ? (
                        <>
                          <div>
                            <label
                              htmlFor="queue-pattern-filter"
                              className="mb-0.5 block text-[10px] font-semibold text-slate-500"
                            >
                              Meeting pattern
                            </label>
                            <select
                              id="queue-pattern-filter"
                              className="min-w-0 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
                              value={patternFilter}
                              onChange={(e) => setPatternFilter(e.target.value)}
                            >
                              <option value="">All patterns</option>
                              {patternOptions.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label
                              htmlFor="queue-sort-by"
                              className="mb-0.5 block text-[10px] font-semibold text-slate-500"
                            >
                              Sort by
                            </label>
                            <select
                              id="queue-sort-by"
                              className="min-w-0 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
                              value={sortBy}
                              onChange={(e) => setSortBy(e.target.value as QueueSort)}
                            >
                              <option value="course">Course name</option>
                              <option value="pattern">Meeting pattern</option>
                            </select>
                          </div>
                          <label className="flex min-w-0 cursor-pointer items-center gap-2 text-[10px] font-semibold text-slate-600">
                            <input
                              type="checkbox"
                              className="size-3.5 shrink-0 rounded border-slate-300"
                              checked={needsAttentionOnly}
                              onChange={(e) => setNeedsAttentionOnly(e.target.checked)}
                            />
                            <span className="min-w-0">Needs attention only</span>
                          </label>
                        </>
                      ) : null}
                      {activeFilterCount > 0 ? (
                        <button
                          type="button"
                          className="w-full text-left text-[10px] font-semibold text-sky-700 hover:text-sky-900"
                          onClick={clearFilters}
                        >
                          Clear filters
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3 pt-2 space-y-1.5 [scrollbar-gutter:stable]">
              {filtered.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-slate-400">No sections</p>
              ) : (
                filtered.map((row) => {
                  const { title, instructor } = formatCalendarSectionHoverLines(
                    row,
                    row.instructorName,
                  );
                  const active = activeDragSectionId === row.id;
                  const invalidation = row.editorInvalidation;
                  const placeBlocked = invalidation?.reason === "pattern";
                  const badge = termBadgeLabel(row.term, row.assignment?.assigned_half);
                  return (
                    <div
                      key={row.id}
                      data-queue-section-row="true"
                      className={clsx(
                        "flex w-full items-start gap-2 rounded-lg border px-2 py-2 text-left transition-colors",
                        active
                          ? "border-sky-400 bg-sky-50 ring-2 ring-sky-200"
                          : invalidation
                            ? "border-amber-300 border-l-4 border-l-amber-400 bg-amber-50/80 hover:border-amber-400"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      <button
                        type="button"
                        draggable={!placeBlocked}
                        aria-label={`Drag ${title} to calendar`}
                        className={clsx(
                          "mt-0.5 shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600",
                          placeBlocked ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing",
                        )}
                        onDragStart={(e) => {
                          if (placeBlocked) {
                            e.preventDefault();
                            return;
                          }
                          suppressRowClickRef.current = true;
                          e.dataTransfer.setData("text/section-id", row.id);
                          e.dataTransfer.effectAllowed = "move";
                          const card = e.currentTarget.closest("[data-queue-section-row]");
                          if (card instanceof HTMLElement) {
                            setCalendarDragImage(e.nativeEvent, card, { width: 200, offsetY: 20 });
                          }
                          onBeginPlace(row.id);
                        }}
                        onDragEnd={() => {
                          onPlacementDragEnd?.();
                          window.setTimeout(() => {
                            suppressRowClickRef.current = false;
                          }, 0);
                        }}
                      >
                        <GripVertical className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          if (suppressRowClickRef.current) {
                            suppressRowClickRef.current = false;
                            return;
                          }
                          onEditSection(row.id);
                        }}
                      >
                        {invalidation ? (
                          <span className="mb-1 inline-flex rounded bg-amber-200/80 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-900">
                            Auto-unplaced
                          </span>
                        ) : null}
                        <div className="flex min-w-0 items-center gap-1">
                          <div className="truncate text-[11px] font-bold text-slate-900">{title}</div>
                          {badge ? <TermBadge badge={badge} className="!size-4 text-[8px]" /> : null}
                        </div>
                        <div className="truncate text-[10px] text-slate-500">{instructor}</div>
                        {invalidation ? (
                          <div className="mt-1 flex min-w-0 items-start gap-1 text-[9px] font-semibold text-amber-800">
                            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                            <span className="min-w-0 break-words">
                              {invalidation.message ||
                                invalidationLabel(invalidation.reason)}
                            </span>
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
                      </button>
                      <button
                        type="button"
                        className="mt-0.5 shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={`Edit ${title}`}
                        onClick={() => onEditSection(row.id)}
                      >
                        <Pencil className="size-3" />
                      </button>
                    </div>
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

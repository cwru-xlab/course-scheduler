"use client";

import { useState, type MouseEvent, type PointerEvent } from "react";
import clsx from "clsx";
import { Lock, LockOpen, Shuffle, Unlock } from "lucide-react";

import type { CalendarSectionLike } from "./calendarEvents";
import type { SectionLockState } from "@/lib/scheduling/types";

type DepartmentPalette = {
  cardBg: string;
  cardBorder: string;
  cardPattern?: string;
};

type InstructorLookup = {
  get(id: string): { name?: string } | undefined;
};

type CrosslistCalendarEventCardProps = {
  crosslistGroupId: string;
  members: CalendarSectionLike[];
  timeLabel: string;
  color: DepartmentPalette;
  matchesHoveredDepartment: boolean;
  isDragSource: boolean;
  hasDragMoved: boolean;
  placementLocked: SectionLockState;
  draggable: boolean;
  lockable?: boolean;
  isStaggered?: boolean;
  /** Shared 100/400/800… designation for all crosslist members. */
  sectionDesignation?: string | null;
  designationBySectionId?: Map<string, string>;
  onToggleLock?: (e?: MouseEvent<HTMLButtonElement>) => void;
  isConflicting?: boolean;
  style: {
    left: string;
    width: string;
    top: number;
    height: number;
  };
  instructorById: InstructorLookup;
  onContextMenu: (event: MouseEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
};

function memberCourseLabel(section: CalendarSectionLike): string {
  const dept = (section.department ?? "").toString().trim();
  const course = String(section.course_id ?? "").trim();
  return [dept, course].filter(Boolean).join(" ");
}

/** Same slate RGB as dept calendar hatch lines (page.tsx cardPattern). */
const CROSSLIST_X_STROKE = "rgba(15, 23, 42, 0.1)";

export type CrosslistSwatchPalette = {
  cardBg: string;
  cardBorder: string;
};

function CrosslistXSvg({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <line
        x1="0"
        y1="0"
        x2="100"
        y2="100"
        stroke={CROSSLIST_X_STROKE}
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="100"
        y1="0"
        x2="0"
        y2="100"
        stroke={CROSSLIST_X_STROKE}
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Mini swatch for the crosslist groups legend (matches calendar card styling). */
export function CrosslistLegendSwatch({ swatch }: { swatch: CrosslistSwatchPalette }) {
  return (
    <span className="relative inline-block h-3.5 w-6 shrink-0 overflow-hidden rounded border border-slate-300/70 shadow-sm">
      <span
        className="absolute inset-0 rounded border-l-[3px]"
        style={{
          backgroundColor: swatch.cardBg,
          borderLeftColor: swatch.cardBorder,
        }}
      />
      <CrosslistXSvg className="absolute inset-0 h-full w-full" />
    </span>
  );
}

function CrosslistXOverlay() {
  return (
    <CrosslistXSvg className="pointer-events-none absolute inset-0 z-0 h-full w-full" />
  );
}

export function CrosslistCalendarEventCard({
  crosslistGroupId,
  members,
  timeLabel,
  color,
  matchesHoveredDepartment,
  isDragSource,
  hasDragMoved,
  placementLocked,
  draggable,
  lockable = false,
  isStaggered = false,
  sectionDesignation = null,
  designationBySectionId,
  onToggleLock,
  isConflicting = false,
  style,
  instructorById,
  onContextMenu,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onClick,
}: CrosslistCalendarEventCardProps) {
  const [hovered, setHovered] = useState(false);
  const designation = String(sectionDesignation ?? "").trim();

  return (
    <div
      className={clsx("absolute", hovered ? "z-50" : "z-10")}
      data-crosslist-hover={hovered ? "true" : undefined}
      style={{
        left: style.left,
        width: style.width,
        top: style.top,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={clsx(
          "group relative overflow-hidden border-l-4 rounded-lg p-2.5 flex flex-col justify-between shadow-sm select-none",
          draggable && "cursor-grab touch-none active:cursor-grabbing",
          !isDragSource && "hover:shadow-md",
          isDragSource && hasDragMoved && "opacity-[0.12] pointer-events-none",
          !matchesHoveredDepartment && "opacity-35",
          matchesHoveredDepartment && "ring-2 ring-slate-300/80 shadow-md",
          isConflicting && "ring-2 ring-red-500 ring-offset-1 shadow-md",
        )}
        style={{
          height: style.height,
          backgroundColor: color.cardBg,
          borderLeftColor: color.cardBorder,
        }}
        title={`Cross-list ${crosslistGroupId} • ${members.length} sections • ${timeLabel}${
          isStaggered ? " • Staggered across days" : ""
        }`}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={onClick}
      >
        <CrosslistXOverlay />
        {isStaggered && (
          <span
            className="absolute left-1 top-1 z-[4] flex size-5 items-center justify-center rounded-md border border-indigo-200 bg-indigo-50/95 text-indigo-700 shadow-sm"
            title="Staggered: different times on different days"
            aria-label="Staggered across days"
          >
            <Shuffle className="size-3" aria-hidden />
          </span>
        )}
        <div className="absolute right-1 top-1 z-[4] flex items-center gap-1">
          {lockable && onToggleLock && (
            <button
              type="button"
              className={clsx(
                "flex size-5 shrink-0 items-center justify-center rounded-md border shadow-sm transition-opacity",
                placementLocked === "hard"
                  ? "border-red-300 bg-red-50 text-red-900 opacity-100"
                  : placementLocked === "soft"
                    ? "border-amber-300 bg-amber-50 text-amber-900 opacity-100"
                    : "border-slate-300 bg-white/90 text-slate-600 opacity-0 hover:bg-white focus-visible:opacity-100 group-hover:opacity-100",
              )}
              title={
                placementLocked === "hard"
                  ? "Hard-locked — click to unlock"
                  : placementLocked === "soft"
                    ? "Soft-locked — click to hard-lock"
                    : "Lock for solver"
              }
              aria-label={
                placementLocked === "hard"
                  ? "Hard-locked"
                  : placementLocked === "soft"
                    ? "Soft-locked"
                    : "Not locked"
              }
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock?.(e);
              }}
            >
              {placementLocked === "hard" ? (
                <Lock className="size-3" />
              ) : placementLocked === "soft" ? (
                <LockOpen className="size-3" />
              ) : (
                <Unlock className="size-3" />
              )}
            </button>
          )}
        </div>
        <div
          className={clsx(
            "relative z-[1] font-black text-[10px] truncate text-slate-900 pr-9",
            isStaggered && "pl-6",
          )}
        >
          {crosslistGroupId}
          {designation ? (
            <span className="ml-1 font-bold text-[9px] text-slate-600 tabular-nums">
              · {designation}
            </span>
          ) : null}
        </div>
        <div className="relative z-[1] text-[9px] font-bold leading-tight text-slate-700">
          <div className="truncate text-slate-800">
            {members.length} cross-listed sections
          </div>
          <div className="text-[8px] leading-snug truncate">{timeLabel}</div>
        </div>
      </div>

      {hovered && (
        <div
          className="absolute left-1/2 top-full z-[60] flex -translate-x-1/2 flex-col items-center pt-1 pointer-events-none"
          aria-hidden
        >
          <div className="h-2 w-px bg-slate-400/90" />
          <div className="relative flex items-start justify-center gap-2 pt-1">
            <div className="absolute top-0 h-px bg-slate-400/90" style={{ left: "8%", right: "8%" }} />
            {members.map((member) => {
              const instructor =
                instructorById.get(member.instructor_id)?.name?.trim() ||
                member.instructor_id ||
                "—";
              const memberDesignation =
                designationBySectionId?.get(member.id) ?? designation;
              return (
                <div key={member.id} className="flex flex-col items-center">
                  <div className="h-2 w-px bg-slate-400/90" />
                  <div className="min-w-[88px] max-w-[120px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-center shadow-lg ring-1 ring-slate-200/80">
                    <div className="truncate text-[9px] font-black text-slate-900">
                      {memberCourseLabel(member)}
                    </div>
                    {memberDesignation ? (
                      <div className="truncate text-[8px] font-semibold text-slate-600 tabular-nums">
                        Sec {memberDesignation}
                      </div>
                    ) : null}
                    <div className="truncate text-[8px] text-slate-500">{instructor}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

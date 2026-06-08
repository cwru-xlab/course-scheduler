"use client";

import { useState, type MouseEvent, type PointerEvent } from "react";
import clsx from "clsx";
import { Lock } from "lucide-react";

import type { CalendarSectionLike } from "./calendarEvents";

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
  placementLocked: boolean;
  draggable: boolean;
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
          "relative overflow-hidden border-l-4 rounded-lg p-2.5 flex flex-col justify-between shadow-sm select-none",
          draggable && "cursor-grab touch-none active:cursor-grabbing",
          !isDragSource && "hover:shadow-md",
          isDragSource && hasDragMoved && "opacity-[0.12] pointer-events-none",
          !matchesHoveredDepartment && "opacity-35",
          matchesHoveredDepartment && "ring-2 ring-slate-300/80 shadow-md",
        )}
        style={{
          height: style.height,
          backgroundColor: color.cardBg,
          borderLeftColor: color.cardBorder,
        }}
        title={`Cross-list ${crosslistGroupId} • ${members.length} sections • ${timeLabel}`}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={onClick}
      >
        <CrosslistXOverlay />
        {placementLocked && (
          <Lock
            className="pointer-events-none absolute right-1 top-1 z-[2] size-3.5 text-slate-800 drop-shadow-sm opacity-90"
            aria-label="Placement locked for solver"
          />
        )}
        <div className="relative z-[1] font-black text-[10px] truncate text-slate-900 pr-4">
          {crosslistGroupId}
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
              return (
                <div key={member.id} className="flex flex-col items-center">
                  <div className="h-2 w-px bg-slate-400/90" />
                  <div className="min-w-[88px] max-w-[120px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-center shadow-lg ring-1 ring-slate-200/80">
                    <div className="truncate text-[9px] font-black text-slate-900">
                      {memberCourseLabel(member)}
                    </div>
                    <div className="truncate text-[8px] font-semibold text-slate-600">
                      Sec {member.section_code}
                    </div>
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

"use client";

import { useState, type MouseEvent, type PointerEvent } from "react";
import clsx from "clsx";
import { Lock, LockOpen, Shuffle, Unlock, GripVertical } from "lucide-react";

import { CalendarSectionHoverTip } from "./CalendarSectionHoverTip";
import { setCalendarDragImage } from "./calendarDragGhost";
import type { SectionLockState } from "@/lib/scheduling/types";
import { TermBadge } from "@/components/calendar/TermBadge";

type TermBadgeLabel = "H1" | "H2" | null;

type DepartmentPalette = {
  cardBg: string;
  cardBorder: string;
  cardPattern?: string;
};

type SoloCalendarEventCardProps = {
  timeLabel: string;
  /** On-card face title (dept + course_id). */
  faceTitle: string;
  professor: string;
  hoverTitle: string;
  hoverInstructor: string;
  hoverTermLine?: string | null;
  termBadge?: TermBadgeLabel;
  termStackRank?: number;
  halfPairAccent?: string;
  color: DepartmentPalette;
  matchesHoveredDepartment: boolean;
  hasActiveFilter?: boolean;
  isDragSource: boolean;
  hasDragMoved: boolean;
  placementLocked: SectionLockState;
  draggable: boolean;
  lockable?: boolean;
  isStaggered?: boolean;
  onToggleLock?: (e?: MouseEvent<HTMLButtonElement>) => void;
  isConflicting?: boolean;
  style: {
    left: string;
    width: string;
    top: number;
    height: number;
  };
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
  /** When set, shows a grip handle for HTML5 drag-to-queue unplace. */
  queueDragSectionId?: string;
  onQueueDragBlocked?: () => void;
};

export function SoloCalendarEventCard({
  timeLabel,
  faceTitle,
  professor,
  hoverTitle,
  hoverInstructor,
  hoverTermLine,
  termBadge,
  termStackRank = 2,
  halfPairAccent,
  color,
  matchesHoveredDepartment,
  hasActiveFilter = false,
  isDragSource,
  hasDragMoved,
  placementLocked,
  draggable,
  lockable = false,
  isStaggered = false,
  onToggleLock,
  isConflicting = false,
  style,
  onContextMenu,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onClick,
  queueDragSectionId,
  onQueueDragBlocked,
}: SoloCalendarEventCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={clsx(
        "absolute",
        hovered ? "z-50" : isConflicting ? "z-30" : termStackRank === 0 ? "z-20" : "z-10",
      )}
      data-calendar-hover={hovered ? "true" : undefined}
      style={{
        left: style.left,
        width: style.width,
        top: style.top,
        minWidth: 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        data-calendar-event-card="true"
        className={clsx(
          "group relative overflow-hidden border-l-4 rounded-lg p-2 flex flex-col gap-0.5 shadow-sm select-none",
          draggable && "cursor-grab touch-none active:cursor-grabbing",
          !isDragSource && "hover:shadow-md",
          isDragSource && hasDragMoved && "opacity-[0.12] pointer-events-none",
          !matchesHoveredDepartment && "opacity-35",
          hasActiveFilter &&
            matchesHoveredDepartment &&
            "ring-2 ring-slate-300/80 shadow-md",
          isConflicting && "ring-2 ring-red-500 ring-offset-1 shadow-md",
        )}
        style={{
          height: style.height,
          backgroundColor: color.cardBg,
          backgroundImage: color.cardPattern,
          borderLeftColor: halfPairAccent ?? color.cardBorder,
          borderLeftWidth: halfPairAccent ? 6 : undefined,
        }}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={onClick}
      >
        <div className="absolute right-0.5 top-0.5 z-[3] flex items-center gap-0.5">
          {queueDragSectionId ? (
            <span
              draggable
              className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded-md border border-slate-300 bg-white/90 text-slate-500 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
              title="Drag to queue sidebar to unplace"
              aria-label="Drag to queue sidebar to unplace"
              onPointerDown={(e) => e.stopPropagation()}
              onDragStart={(e) => {
                if (placementLocked !== "none") {
                  e.preventDefault();
                  onQueueDragBlocked?.();
                  return;
                }
                e.dataTransfer.setData("text/section-id", queueDragSectionId);
                e.dataTransfer.effectAllowed = "move";
                const card = (e.currentTarget as HTMLElement).closest(
                  "[data-calendar-event-card]",
                ) as HTMLElement | null;
                if (card) {
                  setCalendarDragImage(e.nativeEvent, card, { width: 180, offsetY: 28 });
                }
              }}
            >
              <GripVertical className="size-3" />
            </span>
          ) : null}
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
        <div className="flex min-w-0 items-start gap-1 pr-5">
          {isStaggered ? (
            <span
              className="mt-px flex size-4 shrink-0 items-center justify-center rounded border border-indigo-200 bg-indigo-50/95 text-indigo-700"
              title="Staggered: different times on different days"
              aria-label="Staggered across days"
            >
              <Shuffle className="size-2.5" aria-hidden />
            </span>
          ) : null}
          {termBadge ? <TermBadge badge={termBadge} className="mt-px size-4 shrink-0 text-[8px]" /> : null}
          <div className="min-w-0 flex-1 font-black text-[10px] leading-tight text-slate-900 line-clamp-2 break-words">
            {faceTitle}
          </div>
        </div>
        <div className="min-w-0 text-[9px] font-bold leading-tight text-slate-700">
          <div className="line-clamp-1 break-words">{professor}</div>
          <div className="text-[8px] leading-snug line-clamp-1 break-words">{timeLabel}</div>
        </div>
      </div>

      {hovered ? (
        <CalendarSectionHoverTip
          title={hoverTitle}
          instructor={hoverInstructor}
          termLine={hoverTermLine}
        />
      ) : null}
    </div>
  );
}

import {
  calendarEventConflictsWithSectionIds,
  calendarEventDisplayLabel,
  calendarEventInstructorIds,
  calendarEventSectionIds,
  getCalendarEventRoomId,
  type CalendarEvent,
} from "./calendarEvents";
import type { TimeslotDto } from "./calendarTypes";
import { isPlaceholderInstructor } from "@/lib/scheduling/placeholderInstructor";

/**
 * Single source of truth for calendar placement validation.
 *
 * Both the drag-and-drop path (`commitCalendarPlacement`) and the click-to-place
 * path (`commitPlacementByClick`) call {@link evaluatePlacement} so that room
 * overlaps and instructor double-bookings mean the same thing regardless of how
 * the user moved the section. This module is intentionally React-free and pure so
 * it stays unit-testable.
 */

export type PlacementSeverity = "block" | "warn" | "ok";

export type PlacementReasonCode =
  | "blocked"
  | "capacity"
  | "room_conflict"
  | "instructor_conflict"
  | "missing_data"
  | "online_section";

export type PlacementEvaluation = {
  /** `block` = do not apply the move; `warn` = apply but flag; `ok` = clean. */
  severity: PlacementSeverity;
  reasonCode: PlacementReasonCode | null;
  message: string;
  /** Section ids involved in a warn-level conflict (for highlighting). */
  conflictSectionIds: string[];
};

export type TimeslotWithMinutes = TimeslotDto & { start: number; end: number };

type PlacementSectionLike = {
  id: string;
  course_id: string | number;
  department?: string | null;
  instructor_id: string;
  enrollment_cap?: number;
  expected_enrollment?: number;
  crosslist_group_id?: string | null;
  room_id?: string | null;
  timeslot_id?: string | null;
};

type PlacementRoomLike = {
  id: string;
  capacity?: number;
};

type PlacementData = {
  sections: PlacementSectionLike[];
  rooms: PlacementRoomLike[];
};

type PlacementAssignmentEntry = {
  timeslot_ids: string[];
  room_id: string;
  meeting_pattern_id: string;
};

type PlacementAssignmentMap = Record<string, PlacementAssignmentEntry>;

type InstructorLike = {
  id: string;
  name?: string;
};

/** Cross-listed sections share a room; capacity need is the max member cap. */
export function requiredSeatsForSections(
  linkedSectionIds: string[],
  sections: PlacementSectionLike[],
): number {
  return linkedSectionIds.reduce((maxSeats, linkedSectionId) => {
    const linkedSection = sections.find((section) => section.id === linkedSectionId);
    const seats = linkedSection?.enrollment_cap ?? linkedSection?.expected_enrollment ?? 0;
    return Math.max(maxSeats, seats);
  }, 0);
}

/** True when [aStart, aEnd) and [bStart, bEnd) overlap. */
export function minutesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function evaluatePlacement(input: {
  sectionId: string;
  targetRoomId: string;
  slot: TimeslotWithMinutes;
  selectedDay: string;
  data: PlacementData;
  assignmentsBySection: PlacementAssignmentMap;
  allDayEvents: CalendarEvent[];
  linkedSectionIds: string[];
  instructorById: Map<string, InstructorLike>;
  findBlockedPlacementMessage: (
    sectionId: string,
    targetRoomId: string,
    slot: TimeslotWithMinutes,
  ) => string | null;
  formatTime: (hhmm: string) => string;
}): PlacementEvaluation {
  const {
    sectionId,
    targetRoomId,
    slot,
    selectedDay,
    data,
    assignmentsBySection,
    allDayEvents,
    linkedSectionIds,
    instructorById,
    findBlockedPlacementMessage,
    formatTime,
  } = input;

  const section = data.sections.find((s) => s.id === sectionId);
  if (!section) {
    return {
      severity: "block",
      reasonCode: "missing_data",
      message: "Section not found.",
      conflictSectionIds: [],
    };
  }

  const linkedIds = linkedSectionIds.length ? linkedSectionIds : [sectionId];
  const linkedSectionIdSet = new Set(linkedIds);
  const timeStr = `${formatTime(slot.start_time)}-${formatTime(slot.end_time)}`;

  // 1. Blocked time — hard block, never applied.
  for (const linkedSectionId of linkedIds) {
    const blockedMessage = findBlockedPlacementMessage(linkedSectionId, targetRoomId, slot);
    if (blockedMessage) {
      return {
        severity: "block",
        reasonCode: "blocked",
        message: blockedMessage,
        conflictSectionIds: [],
      };
    }
  }

  // 2. Capacity — hard block, never applied.
  const targetRoom = data.rooms.find((room) => room.id === targetRoomId);
  const requiredSeats = requiredSeatsForSections(linkedIds, data.sections);
  if (Number.isFinite(targetRoom?.capacity) && requiredSeats > (targetRoom?.capacity ?? 0)) {
    return {
      severity: "block",
      reasonCode: "capacity",
      message: `Invalid: ${section.department ?? ""} ${section.course_id} requires ${requiredSeats} seats, but room ${targetRoomId} capacity is ${targetRoom?.capacity}.`,
      conflictSectionIds: [],
    };
  }

  const resolveEventRoomId = (eventItem: CalendarEvent) =>
    getCalendarEventRoomId(
      eventItem,
      (memberId) =>
        assignmentsBySection[memberId]?.room_id ??
        data.sections.find((s) => s.id === memberId)?.room_id ??
        "",
    );

  const overlapsSelected = (eventItem: CalendarEvent) =>
    minutesOverlap(slot.start, slot.end, eventItem.start, eventItem.end);

  // 3. Room overlap — warning, move still applied.
  const roomConflicts = allDayEvents.filter((eventItem) => {
    if (!calendarEventConflictsWithSectionIds(eventItem, linkedSectionIdSet)) return false;
    if (resolveEventRoomId(eventItem) !== targetRoomId) return false;
    return overlapsSelected(eventItem);
  });

  // 4. Instructor double-booking (any room) — warning, move still applied.
  const draggedInstructorIds = new Set<string>();
  for (const linkedSectionId of linkedIds) {
    const linked = data.sections.find((s) => s.id === linkedSectionId);
    const instructorId = linked?.instructor_id;
    if (!instructorId) continue;
    const instructorName = instructorById.get(instructorId)?.name;
    if (isPlaceholderInstructor(instructorId, instructorName)) continue;
    draggedInstructorIds.add(instructorId);
  }
  const instructorConflicts =
    draggedInstructorIds.size === 0
      ? []
      : allDayEvents.filter((eventItem) => {
          if (!calendarEventConflictsWithSectionIds(eventItem, linkedSectionIdSet)) return false;
          if (!overlapsSelected(eventItem)) return false;
          return calendarEventInstructorIds(eventItem).some((id) =>
            draggedInstructorIds.has(id),
          );
        });

  if (roomConflicts.length === 0 && instructorConflicts.length === 0) {
    return {
      severity: "ok",
      reasonCode: null,
      message: `Valid placement: room ${targetRoomId}, ${selectedDay} ${timeStr}. This change can be persisted.`,
      conflictSectionIds: [],
    };
  }

  const flagged = new Set<string>(linkedIds);
  for (const eventItem of [...roomConflicts, ...instructorConflicts]) {
    for (const id of calendarEventSectionIds(eventItem)) flagged.add(id);
  }

  // Instructor conflicts take message priority so their spec'd wording is shown.
  if (instructorConflicts.length > 0) {
    const conflictingInstructorId = Array.from(draggedInstructorIds).find((id) =>
      instructorConflicts.some((eventItem) =>
        calendarEventInstructorIds(eventItem).includes(id),
      ),
    );
    const instructorName = conflictingInstructorId
      ? instructorById.get(conflictingInstructorId)?.name ?? conflictingInstructorId
      : "This instructor";
    const courseLabel = calendarEventDisplayLabel(instructorConflicts[0]) || "another class";
    return {
      severity: "warn",
      reasonCode: "instructor_conflict",
      message: `Warning: ${instructorName} already teaches ${courseLabel} at ${selectedDay} ${timeStr}. Both classes highlighted for your review.`,
      conflictSectionIds: Array.from(flagged),
    };
  }

  const roomNames = roomConflicts
    .map((c) => calendarEventDisplayLabel(c))
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  return {
    severity: "warn",
    reasonCode: "room_conflict",
    message: `Warning: ${section.department ?? ""} ${section.course_id} shares room ${targetRoomId} with ${roomNames || "another class"} at ${selectedDay} ${timeStr}. Both classes highlighted for your review.`,
    conflictSectionIds: Array.from(flagged),
  };
}

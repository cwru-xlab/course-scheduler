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
import { isOnlineSection } from "@/lib/scheduling/sectionOnline";

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

export type EditorInvalidationReason = "pattern" | "capacity" | "room_requirements";

export type EditorInvalidatedPlacement = {
  sectionId: string;
  reason: EditorInvalidationReason;
  message: string;
};

export type PreservedAssignmentValidationResult =
  | { valid: true }
  | { valid: false; reason: EditorInvalidationReason; message: string };

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
  section_number?: string | null;
  room_requirements?: string[];
  allowed_meeting_patterns?: string[];
};

type PlacementRoomLike = {
  id: string;
  capacity?: number;
  features?: string[];
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

function allowedPatternsSignature(patterns: string[] | undefined): string {
  return [...(patterns ?? [])].map((p) => p.trim()).filter(Boolean).sort().join("\0");
}

function allowedMeetingPatternsChanged(
  prev: PlacementSectionLike | undefined,
  fresh: PlacementSectionLike,
): boolean {
  if (!prev) return false;
  return (
    allowedPatternsSignature(prev.allowed_meeting_patterns) !==
    allowedPatternsSignature(fresh.allowed_meeting_patterns)
  );
}

function isPatternValidForSection(section: PlacementSectionLike, meetingPatternId: string): boolean {
  const patternId = meetingPatternId.trim();
  if (!patternId) return true;
  const allowed = section.allowed_meeting_patterns ?? [];
  if (!allowed.length) return true;
  return allowed.includes(patternId);
}

/** Room features must include every required feature (matches solver logic). */
export function roomMeetsRequirements(
  room: { features?: string[] },
  requirements: string[],
): boolean {
  const required = requirements.map((r) => r.trim()).filter(Boolean);
  if (!required.length) return true;
  const features = room.features ?? [];
  return required.every((feature) => features.includes(feature));
}

/**
 * Re-validate an existing placement after editor metadata changes.
 * Used during editor-to-calendar merge to auto-unplace stale assignments.
 */
export function validatePreservedAssignment(input: {
  section: PlacementSectionLike;
  prevSection?: PlacementSectionLike;
  linkedSectionIds: string[];
  allSections: PlacementSectionLike[];
  assignment: { room_id: string; meeting_pattern_id?: string; timeslot_ids?: string[] };
  rooms: PlacementRoomLike[];
}): PreservedAssignmentValidationResult {
  const { section, prevSection, linkedSectionIds, allSections, assignment, rooms } = input;
  const linkedIds = linkedSectionIds.length ? linkedSectionIds : [section.id];
  const patternId = String(assignment.meeting_pattern_id ?? "").trim();
  const roomId = String(assignment.room_id ?? "").trim();
  const online = isOnlineSection(section);

  if (
    allowedMeetingPatternsChanged(prevSection, section) &&
    patternId &&
    !isPatternValidForSection(section, patternId)
  ) {
    return {
      valid: false,
      reason: "pattern",
      message: "Pattern no longer allowed — fix in editor",
    };
  }

  if (!online && roomId) {
    const targetRoom = rooms.find((room) => room.id === roomId);
    const requiredSeats = requiredSeatsForSections(linkedIds, allSections);
    if (Number.isFinite(targetRoom?.capacity) && requiredSeats > (targetRoom?.capacity ?? 0)) {
      return {
        valid: false,
        reason: "capacity",
        message: `Enrollment exceeds room capacity (${requiredSeats} seats needed, room ${roomId} holds ${targetRoom?.capacity}).`,
      };
    }

    const requirements = section.room_requirements ?? [];
    if (targetRoom && requirements.length > 0 && !roomMeetsRequirements(targetRoom, requirements)) {
      const missing = requirements.filter((req) => !(targetRoom.features ?? []).includes(req));
      return {
        valid: false,
        reason: "room_requirements",
        message:
          missing.length > 0
            ? `Assigned room missing required features: ${missing.join(", ")}`
            : "Assigned room missing required features",
      };
    }
  }

  return { valid: true };
}

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
  /** Defaults to allDayEvents; pass merged in-person + online for cross-modality instructor checks. */
  instructorConflictEvents?: CalendarEvent[];
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
    instructorConflictEvents: instructorEventsInput,
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

  const instructorConflictEvents = instructorEventsInput ?? allDayEvents;
  const targetRoomIdTrimmed = targetRoomId.trim();

  // 3. Room overlap — warning, move still applied (in-person only).
  const roomConflicts = !targetRoomIdTrimmed
    ? []
    : allDayEvents.filter((eventItem) => {
        if (!calendarEventConflictsWithSectionIds(eventItem, linkedSectionIdSet)) return false;
        if (resolveEventRoomId(eventItem) !== targetRoomId) return false;
        return overlapsSelected(eventItem);
      });

  // 4. Instructor double-booking (any modality) — warning, move still applied.
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
      : instructorConflictEvents.filter((eventItem) => {
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

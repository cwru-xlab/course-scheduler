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
import {
  normalizeAssignedHalf,
  normalizeSemesterLength,
  occupiedHalvesInSlot,
  resolveHalfAnyHalf,
  slotHasTermConflict,
  type TermOccupant,
} from "@/lib/scheduling/semesterLength";

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
  | "room_requirements"
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
  semester_length?: string | null;
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
  assigned_half?: string | null;
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
      message: "Meeting patterns changed — place in a compatible timeslot",
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

function termOccupantsForSections(
  sectionIds: string[],
  data: PlacementData,
  assignmentsBySection: PlacementAssignmentMap,
): TermOccupant[] {
  return sectionIds.map((sectionId) => {
    const section = data.sections.find((item) => item.id === sectionId);
    return {
      sectionId,
      semesterLength: section?.semester_length,
      assignedHalf: assignmentsBySection[sectionId]?.assigned_half,
    };
  });
}

/** Auto-resolve assigned_half for half_any when placing into a room/slot. */
export function resolvePlacementAssignedHalf(input: {
  section: PlacementSectionLike;
  existingAssignedHalf?: string | null;
  otherSectionIds: string[];
  data: PlacementData;
  assignmentsBySection: PlacementAssignmentMap;
}): "first_half" | "second_half" | null {
  if (normalizeSemesterLength(input.section.semester_length) !== "half_any") {
    return normalizeAssignedHalf(input.existingAssignedHalf);
  }
  const otherOccupants = termOccupantsForSections(
    input.otherSectionIds,
    input.data,
    input.assignmentsBySection,
  );
  return resolveHalfAnyHalf({
    semesterLength: input.section.semester_length,
    assignedHalf: input.existingAssignedHalf,
    occupiedHalves: occupiedHalvesInSlot(otherOccupants),
  });
}

/** True when moving sections cannot share a room/instructor slot with the others (term-aware). */
export function placementTermConflict(
  movingSectionIds: string[],
  otherSectionIds: string[],
  data: PlacementData,
  assignmentsBySection: PlacementAssignmentMap,
): boolean {
  const otherOccupants = termOccupantsForSections(
    otherSectionIds,
    data,
    assignmentsBySection,
  );
  const occupied = occupiedHalvesInSlot(otherOccupants);
  const movingOccupants: TermOccupant[] = movingSectionIds.map((sectionId) => {
    const section = data.sections.find((item) => item.id === sectionId);
    const normalized = normalizeSemesterLength(section?.semester_length);
    let assignedHalf = assignmentsBySection[sectionId]?.assigned_half ?? null;
    if (normalized === "half_any") {
      assignedHalf =
        resolveHalfAnyHalf({
          semesterLength: section?.semester_length,
          assignedHalf,
          occupiedHalves: occupied,
        }) ?? null;
    }
    return {
      sectionId,
      semesterLength: section?.semester_length,
      assignedHalf,
    };
  });
  return slotHasTermConflict([...otherOccupants, ...movingOccupants]);
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

  if (isOnlineSection(section) && targetRoomId.trim()) {
    return {
      severity: "block",
      reasonCode: "online_section",
      message:
        "Online sections (800–899) use the Online band below — set section number and place there.",
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

  const roomRequirements = section.room_requirements ?? [];
  const roomRequirementMismatch =
    targetRoomId.trim() !== "" &&
    targetRoom &&
    roomRequirements.length > 0 &&
    !roomMeetsRequirements(targetRoom, roomRequirements);
  const missingRoomFeatures = roomRequirementMismatch
    ? roomRequirements.filter((req) => !(targetRoom?.features ?? []).includes(req))
    : [];

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

  const overlappingRoomOtherIds = new Set<string>();
  if (targetRoomId.trim() !== "") {
    for (const eventItem of allDayEvents) {
      if (!calendarEventConflictsWithSectionIds(eventItem, linkedSectionIdSet)) continue;
      if (resolveEventRoomId(eventItem) !== targetRoomId) continue;
      if (!overlapsSelected(eventItem)) continue;
      for (const id of calendarEventSectionIds(eventItem)) {
        if (!linkedSectionIdSet.has(id)) overlappingRoomOtherIds.add(id);
      }
    }
  }

  const hasRoomTermConflict =
    overlappingRoomOtherIds.size > 0 &&
    placementTermConflict(
      linkedIds,
      Array.from(overlappingRoomOtherIds),
      data,
      assignmentsBySection,
    );

  // 3. Room overlap — warning, move still applied (skip for online band with no room).
  const roomConflicts =
    targetRoomId.trim() === "" || !hasRoomTermConflict
      ? []
      : allDayEvents.filter((eventItem) => {
          if (!calendarEventConflictsWithSectionIds(eventItem, linkedSectionIdSet)) return false;
          if (resolveEventRoomId(eventItem) !== targetRoomId) return false;
          if (!overlapsSelected(eventItem)) return false;
          return calendarEventSectionIds(eventItem).some((id) => overlappingRoomOtherIds.has(id));
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

  const overlappingInstructorOtherIds = new Set<string>();
  if (draggedInstructorIds.size > 0) {
    for (const eventItem of instructorConflictEvents) {
      if (!calendarEventConflictsWithSectionIds(eventItem, linkedSectionIdSet)) continue;
      if (!overlapsSelected(eventItem)) continue;
      if (!calendarEventInstructorIds(eventItem).some((id) => draggedInstructorIds.has(id))) {
        continue;
      }
      for (const id of calendarEventSectionIds(eventItem)) {
        if (!linkedSectionIdSet.has(id)) overlappingInstructorOtherIds.add(id);
      }
    }
  }

  const hasInstructorTermConflict =
    overlappingInstructorOtherIds.size > 0 &&
    placementTermConflict(
      linkedIds,
      Array.from(overlappingInstructorOtherIds),
      data,
      assignmentsBySection,
    );

  const instructorConflicts =
    draggedInstructorIds.size === 0 || !hasInstructorTermConflict
      ? []
      : instructorConflictEvents.filter((eventItem) => {
          if (!calendarEventConflictsWithSectionIds(eventItem, linkedSectionIdSet)) return false;
          if (!overlapsSelected(eventItem)) return false;
          if (
            !calendarEventInstructorIds(eventItem).some((id) => draggedInstructorIds.has(id))
          ) {
            return false;
          }
          return calendarEventSectionIds(eventItem).some((id) =>
            overlappingInstructorOtherIds.has(id),
          );
        });

  if (roomConflicts.length === 0 && instructorConflicts.length === 0 && !roomRequirementMismatch) {
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

  if (roomRequirementMismatch) {
    const missingLabel =
      missingRoomFeatures.length > 0 ? missingRoomFeatures.join(", ") : "required features";
    return {
      severity: "warn",
      reasonCode: "room_requirements",
      message: `Warning: room ${targetRoomId} is missing ${missingLabel} required by ${section.department ?? ""} ${section.course_id} at ${selectedDay} ${timeStr}.`,
      conflictSectionIds: Array.from(flagged),
    };
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

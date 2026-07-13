"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  CloudBackup,
  Filter,
  Link2,
  Lock,
  Palette,
  Play,
  Plus,
  Redo2,
  Save,
  Share2,
  Shuffle,
  Table2,
  Undo2,
  Unlock,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { MultiSelect } from "@/components/scheduler/MultiSelect";
import { ViewportModal } from "@/components/scheduler/ViewportModal";
import { useAuth } from "@/lib/auth-client";
import {
  LAST_SOLVER_RUN_STORAGE_KEY,
  VIEW_FROM_HISTORY_KEY,
  saveScheduleToHistory,
  type LastSolverRunSnapshot,
} from "@/lib/scheduling/history";
import { isSectionArchived, normalizeSectionState } from "@/lib/scheduling/sectionState";
import {
  SCHEDULING_WINDOW_END_HOUR,
  SCHEDULING_WINDOW_START_HOUR,
} from "@/lib/scheduling/timeWindow";
import type {
  BlockedTime,
  LockedAssignment,
  ScheduleSolution,
  SchedulingInput,
  ValidationError,
} from "@/lib/scheduling/types";
import {
  SCHEDULING_DATA_REFRESH_EVENT,
  useSchedulingData,
} from "@/lib/scheduling/useSchedulingData";
import {
  fetchSharedScheduleFull,
  useSharedScheduleMeta,
} from "@/lib/shared-schedule-client";
import { useSolverLock } from "@/lib/solver-lock-client";
import { useSolverProgress } from "@/lib/solver-progress/SolverProgressContext";
import {
  solverNetworkErrorSummary,
  storeSolverErrorSnapshot,
  storeSolverNetworkError,
} from "@/lib/solver/solverErrorStorage";
import { normalizeNetworkError } from "@/lib/spreadsheet/formatGuide";
import { validateSchedulingInput } from "@/lib/spreadsheet/validateClient";
import { CrosslistCalendarEventCard, CrosslistLegendSwatch } from "./CrosslistCalendarEventCard";
import {
  assignCalendarEventLanes,
  calendarEventInstructorIds,
  calendarEventMatchesFilters,
  calendarEventSectionIds,
  findCalendarEventBySectionId,
  getCalendarEventKey,
  isCrosslistGroupEvent,
  mergeCrosslistCalendarEvents,
  type CalendarEvent,
  type RawCalendarEvent,
} from "./calendarEvents";
import {
  evaluatePlacement as evaluatePlacementShared,
  minutesOverlap,
  type PlacementEvaluation,
  type PlacementSeverity,
} from "./placementValidation";

type TimeslotDto = {
  id: string;
  days?: string; // solver model
  day?: string; // legacy frontend shape
  start_time: string;
  end_time: string;
  slot_type?: string;
};

type TimeslotWithMinutes = TimeslotDto & { start: number; end: number };

type InstructorDto = {
  id: string;
  name?: string;
  rank_type?: string;
  unavailable_times?: string[];
  max_teaching_days?: number;
  preferences?: {
    preferred_times?: string[];
    unavailable_times?: string[];
    preferred_days?: string[];
    preferred_patterns?: string[];
    max_teaching_days?: number;
  };
};

type SectionDto = {
  id: string;
  course_id: string | number;
  /** Calendar colors use this explicit department value. */
  department?: string | null;
  section_code: string;
  instructor_id: string;
  timeslot_id?: string | null;
  room_id?: string | null;
  expected_enrollment?: number;
  enrollment_cap?: number;
  allowed_meeting_patterns?: string[];
  previous_meeting_pattern?: string | null;
  room_requirements?: string[];
  crosslist_group_id?: string | null;
  tags?: string[];
  state?: string | null;
};

type RoomDto = {
  id: string;
  building?: string;
  room_number?: string;
  capacity?: number;
};

type SolverDataDto = {
  sections: SectionDto[];
  instructors: InstructorDto[];
  timeslots: TimeslotDto[];
  rooms: RoomDto[];
};

type SectionFormDraft = {
  id: string;
  department: string;
  course_id: string;
  section_code: string;
  instructor_id: string;
  expected_enrollment: number;
  enrollment_cap: number;
  allowed_meeting_patterns: string;
  room_requirements: string;
  crosslist_group_id: string;
  tags: string;
};

type LastSolverRun = LastSolverRunSnapshot & {
  // Backward compatibility for older snapshots without optional locks.
  lockedSectionIds?: string[];
};

/** Stable signature of an assignment map for cheap equality comparisons. */
const assignmentsSignature = (map: Record<string, {
  timeslot_ids?: string[];
  room_id?: string | null;
  meeting_pattern_id?: string | null;
}>): string =>
  JSON.stringify(
    Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sectionId, v]) => [
        sectionId,
        v.room_id || "",
        v.meeting_pattern_id || "",
        [...(v.timeslot_ids ?? [])].sort(),
      ]),
  );

type SaveScheduleDraft = {
  name: string;
  scheduleDate: string;
};

type SaveScheduleModalState = {
  isOpen: boolean;
  isSaving: boolean;
  error: string | null;
  draft: SaveScheduleDraft;
};

type CalendarAssignmentMap = Record<
  string,
  { timeslot_ids: string[]; room_id: string; meeting_pattern_id: string }
>;

type BlockedRuleMatch = {
  matches: boolean;
  label: string;
};

function crosslistPeerSectionIds(sectionId: string, sections: SectionDto[]): string[] {
  const section = sections.find((s) => s.id === sectionId);
  const gid = section?.crosslist_group_id;
  if (!gid) return [sectionId];
  const peers = sections.filter((s) => s.crosslist_group_id === gid).map((s) => s.id);
  return peers.length ? peers : [sectionId];
}

function mergePlacementLocks(
  baseLocks: LockedAssignment[],
  lockedSectionIds: string[],
  assignments: CalendarAssignmentMap,
  sections: SectionDto[],
): LockedAssignment[] {
  const lockSet = new Set(lockedSectionIds);
  const byId = new Map<string, LockedAssignment>();
  for (const lock of baseLocks) {
    if (!lockSet.has(lock.section_id)) {
      byId.set(lock.section_id, lock);
    }
  }
  for (const sectionId of Array.from(lockSet)) {
    const assignment = assignments[sectionId];
    const ts = [...(assignment?.timeslot_ids ?? [])].filter(Boolean).sort();
    const room = (assignment?.room_id ?? "").trim();
    if (!ts.length || !room) continue;
    for (const sid of crosslistPeerSectionIds(sectionId, sections)) {
      byId.set(sid, {
        section_id: sid,
        fixed_timeslot_set: ts,
        fixed_room: room,
      });
    }
  }
  return Array.from(byId.values());
}

function normalizeAssignmentMapEntry(
  section: SectionDto,
  assignments: CalendarAssignmentMap,
): { timeslot_ids: string[]; room_id: string; meeting_pattern_id: string } {
  const fromMap = assignments[section.id];
  return {
    timeslot_ids:
      fromMap?.timeslot_ids?.length ? fromMap.timeslot_ids : section.timeslot_id ? [section.timeslot_id] : [],
    room_id: (fromMap?.room_id ?? section.room_id ?? "").trim(),
    meeting_pattern_id: fromMap?.meeting_pattern_id ?? section.previous_meeting_pattern ?? "",
  };
}

function todayAsIsoDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
type Day = (typeof DAYS)[number];

const DAY_LETTER: Record<Day, string> = {
  Mon: "M",
  Tue: "T",
  Wed: "W",
  Thu: "R",
  Fri: "F",
};

function timeslotMatchesDay(timeslot: TimeslotDto, selected: Day): boolean {
  const raw = (timeslot.days ?? timeslot.day ?? "").toString().trim();
  if (!raw) return false;

  // Canonical aliases (full names + abbreviations) for exact token matching.
  const aliasesByDay: Record<Day, string[]> = {
    Mon: ["mon", "monday", "m"],
    Tue: ["tue", "tues", "tuesday", "tu", "t"],
    Wed: ["wed", "weds", "wednesday", "w"],
    Thu: ["thu", "thur", "thur", "thurs", "thursday", "th", "r"],
    Fri: ["fri", "friday", "f"],
  };
  const selectedAliases = new Set(aliasesByDay[selected]);

  // Tokenized input handles forms like "Mon/Wed", "Tue,Thu", "Thursday".
  const tokens = raw
    .toLowerCase()
    .split(/[^a-z]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (selectedAliases.has(token)) return true;
  }

  // Compact letter form only (e.g. "MWF", "TR"), but avoid words like "fri".
  const compact = raw.toUpperCase().replace(/[^A-Z]/g, "");
  if (/^[MTWRFSU]+$/.test(compact)) {
    return compact.includes(DAY_LETTER[selected]);
  }

  return false;
}

function parseMinutes(hhmm: string): number {
  const raw = (hhmm ?? "").trim();
  if (!raw) return 0;

  // Supports 24h ("13:30", "13:30:00") and 12h ("1:30 PM")
  const amPmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])$/);
  if (amPmMatch) {
    const hour = parseInt(amPmMatch[1], 10);
    const mins = parseInt(amPmMatch[2], 10);
    const suffix = amPmMatch[3].toUpperCase();
    const normalizedHour =
      suffix === "PM"
        ? hour === 12
          ? 12
          : hour + 12
        : hour === 12
          ? 0
          : hour;
    return normalizedHour * 60 + (Number.isFinite(mins) ? mins : 0);
  }

  const [h, m] = raw.split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function normalizeScopeValue(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

function blockedDaysMatch(dayExpression: unknown, selectedDay: Day): boolean {
  const raw = String(dayExpression ?? "").trim();
  if (!raw) return true;
  const pseudoTimeslot: TimeslotDto = {
    id: "__blocked-day__",
    days: raw,
    start_time: "00:00",
    end_time: "23:59",
  };
  return timeslotMatchesDay(pseudoTimeslot, selectedDay);
}

function blockedRuleOverlapsSlot(rule: BlockedTime, slot: TimeslotWithMinutes, selectedDay: Day): boolean {
  const explicitIds = Array.isArray(rule.timeslot_ids)
    ? rule.timeslot_ids.map((id) => String(id)).filter(Boolean)
    : [];
  if (explicitIds.includes(slot.id)) return true;

  if (!blockedDaysMatch(rule.days, selectedDay)) return false;
  if (!rule.start_time || !rule.end_time) return false;
  const blockStart = parseMinutes(rule.start_time);
  const blockEnd = parseMinutes(rule.end_time);
  if (!Number.isFinite(blockStart) || !Number.isFinite(blockEnd) || blockEnd <= blockStart) {
    return false;
  }
  return slot.start < blockEnd && slot.end > blockStart;
}

function blockedRuleTarget(raw: unknown, aliases: string[]): string {
  if (!raw || typeof raw !== "object") return "";
  const record = raw as Record<string, unknown>;
  for (const key of aliases) {
    const candidate = String(record[key] ?? "").trim();
    if (candidate) return candidate;
  }
  return "";
}

function blockedRuleMatchesSection(
  rule: BlockedTime,
  section: SectionDto,
  targetRoomId?: string,
): BlockedRuleMatch {
  const scope = normalizeScopeValue(rule.scope);
  if (scope === "global") return { matches: true, label: "global policy" };

  if (scope === "program" || scope === "department") {
    const departmentTarget = blockedRuleTarget(rule, [
      "department",
      "program",
      "program_id",
      "target",
      "target_id",
      "scope_value",
      "value",
    ]);
    const sectionDepartment = String(section.department ?? "").trim();
    if (!departmentTarget || !sectionDepartment) {
      return { matches: false, label: "department policy" };
    }
    return {
      matches: sectionDepartment.localeCompare(departmentTarget, undefined, { sensitivity: "accent" }) === 0,
      label: `department ${departmentTarget}`,
    };
  }

  if (scope === "instructor" || scope === "professor") {
    const instructorTarget = blockedRuleTarget(rule, [
      "instructor_id",
      "instructor",
      "professor_id",
      "professor",
      "target",
      "target_id",
      "scope_value",
      "value",
    ]);
    if (!instructorTarget) return { matches: false, label: "instructor policy" };
    return {
      matches:
        String(section.instructor_id ?? "").trim().localeCompare(instructorTarget, undefined, {
          sensitivity: "accent",
        }) === 0,
      label: `professor ${instructorTarget}`,
    };
  }

  if (scope === "room") {
    const roomTarget = blockedRuleTarget(rule, [
      "room_id",
      "room",
      "target",
      "target_id",
      "scope_value",
      "value",
    ]);
    if (!roomTarget) return { matches: false, label: "room policy" };
    const selectedRoom = String(targetRoomId ?? "").trim();
    return {
      matches:
        selectedRoom.localeCompare(roomTarget, undefined, { sensitivity: "accent" }) === 0,
      label: `room ${roomTarget}`,
    };
  }

  if (scope === "course" || scope === "section") {
    const courseTarget = blockedRuleTarget(rule, [
      "course_id",
      "section_id",
      "course",
      "section",
      "target",
      "target_id",
      "scope_value",
      "value",
    ]);
    if (!courseTarget) return { matches: false, label: "course policy" };
    const sectionCourseId = String(section.course_id ?? "").trim();
    const sectionId = String(section.id ?? "").trim();
    const matched =
      sectionCourseId.localeCompare(courseTarget, undefined, { sensitivity: "accent" }) === 0 ||
      sectionId.localeCompare(courseTarget, undefined, { sensitivity: "accent" }) === 0;
    return { matches: matched, label: `course ${courseTarget}` };
  }

  return { matches: false, label: `${scope || "unknown"} policy` };
}

function dayAliasesFor(day: Day): string[] {
  if (day === "Mon") return ["mon", "monday", "m"];
  if (day === "Tue") return ["tue", "tues", "tuesday", "tu", "t"];
  if (day === "Wed") return ["wed", "weds", "wednesday", "w"];
  if (day === "Thu") return ["thu", "thur", "thurs", "thursday", "th", "r"];
  return ["fri", "friday", "f"];
}

function meetingPatternIncludesDay(pattern: SchedulingInput["meeting_patterns"][number], day: Day): boolean {
  const aliases = new Set(dayAliasesFor(day));
  for (const allowed of pattern.allowed_days ?? []) {
    const token = String(allowed ?? "").trim().toLowerCase();
    if (!token) continue;
    if (aliases.has(token)) return true;
    const compact = token.toUpperCase().replace(/[^A-Z]/g, "");
    if (/^[MTWRFSU]+$/.test(compact) && compact.includes(DAY_LETTER[day])) return true;
  }
  return false;
}

function formatTimeAmPm(hhmm: string): string {
  const minutes = parseMinutes(hhmm);
  const h24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${mins.toString().padStart(2, "0")} ${suffix}`;
}

function formatMinutesAsAmPm(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${mins.toString().padStart(2, "0")} ${suffix}`;
}

/** Explicit start–end line for PDF/print (not inferred from the grid). */
function formatScheduleTimeRange(startMin: number, endMin: number): string {
  return `${formatMinutesAsAmPm(startMin)} – ${formatMinutesAsAmPm(endMin)}`;
}

type CrosslistScheduleSummary = {
  isScheduled: boolean;
  dayLabels: string[];
  slotLines: string[];
  roomLabel: string | null;
};

function describeCrosslistGroupSchedule(
  members: SectionDto[],
  assignmentsBySection: CalendarAssignmentMap,
  solverTimeslotIdsBySection: Record<string, string[]>,
  timeslotById: Map<string, TimeslotDto>,
  rooms: RoomDto[],
): CrosslistScheduleSummary {
  const timeslotIdSet = new Set<string>();
  let roomId: string | null = null;

  for (const member of members) {
    const timeslotIds =
      assignmentsBySection[member.id]?.timeslot_ids ??
      solverTimeslotIdsBySection[member.id] ??
      (member.timeslot_id ? [member.timeslot_id] : []);
    for (const id of timeslotIds) {
      if (id) timeslotIdSet.add(String(id));
    }
    if (!roomId) {
      roomId = assignmentsBySection[member.id]?.room_id ?? member.room_id ?? null;
    }
  }

  const slots = Array.from(timeslotIdSet)
    .map((id) => timeslotById.get(id))
    .filter((slot): slot is TimeslotDto => !!slot)
    .sort(
      (a, b) =>
        parseMinutes(a.start_time) - parseMinutes(b.start_time) ||
        String(a.days ?? a.day ?? "").localeCompare(String(b.days ?? b.day ?? "")),
    );

  const dayLabels = DAYS.filter((day) =>
    slots.some((slot) => timeslotMatchesDay(slot, day)),
  );

  const slotLines = slots.map((slot) => {
    const daysRaw = String(slot.days ?? slot.day ?? "").trim();
    const dayPart = daysRaw || dayLabels.join("/") || "—";
    return `${dayPart} · ${formatTimeAmPm(slot.start_time)}–${formatTimeAmPm(slot.end_time)}`;
  });

  const room = roomId ? rooms.find((entry) => entry.id === roomId) : null;
  const roomLabel = room
    ? [room.building, formatRoomNumberForDisplay(room.room_number)].filter(Boolean).join(" ") ||
      room.id
    : roomId;

  return {
    isScheduled: slots.length > 0,
    dayLabels: [...dayLabels],
    slotLines,
    roomLabel: roomLabel ? String(roomLabel) : null,
  };
}

function CrosslistScheduleBanner({
  members,
  assignmentsBySection,
  solverTimeslotIdsBySection,
  timeslotById,
  rooms,
}: {
  members: SectionDto[];
  assignmentsBySection: CalendarAssignmentMap;
  solverTimeslotIdsBySection: Record<string, string[]>;
  timeslotById: Map<string, TimeslotDto>;
  rooms: RoomDto[];
}) {
  const schedule = describeCrosslistGroupSchedule(
    members,
    assignmentsBySection,
    solverTimeslotIdsBySection,
    timeslotById,
    rooms,
  );

  return (
    <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-700">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Schedule
      </div>
      {!schedule.isScheduled ? (
        <p className="text-slate-500">Not scheduled yet.</p>
      ) : (
        <div className="space-y-1">
          {schedule.dayLabels.length > 0 && (
            <p>
              <span className="font-semibold text-slate-600">Days: </span>
              {schedule.dayLabels.join(", ")}
            </p>
          )}
          <p>
            <span className="font-semibold text-slate-600">Time: </span>
            {schedule.slotLines.join(" · ")}
          </p>
          {schedule.roomLabel && (
            <p>
              <span className="font-semibold text-slate-600">Room: </span>
              {schedule.roomLabel}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatRoomNumberForDisplay(roomNumber?: string): string {
  const value = (roomNumber ?? "").toString().trim();
  if (!value) return "";
  // Spreadsheet imports may coerce whole-number room values to strings like "201.0".
  return value.replace(/\.0+$/, "");
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toSectionFormDraft(section: SectionDto): SectionFormDraft {
  return {
    id: String(section.id ?? "").trim(),
    department: String(section.department ?? "").trim(),
    course_id: String(section.course_id ?? "").trim(),
    section_code: String(section.section_code ?? "").trim(),
    instructor_id: String(section.instructor_id ?? "").trim(),
    expected_enrollment: Number(section.expected_enrollment ?? 0),
    enrollment_cap: Number(section.enrollment_cap ?? 0),
    allowed_meeting_patterns: (section.allowed_meeting_patterns ?? []).join(", "),
    room_requirements: (section.room_requirements ?? []).join(", "),
    crosslist_group_id: String(section.crosslist_group_id ?? "").trim(),
    tags: (section.tags ?? []).join(", "),
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function timeslotDurationMinutes(slot: Pick<TimeslotDto, "start_time" | "end_time">): number {
  return Math.max(0, parseMinutes(slot.end_time) - parseMinutes(slot.start_time));
}

function meetingPatternSlotDurationsForDay(
  pattern: { compatible_timeslot_sets?: string[][] } | undefined,
  day: Day,
  timeslotById: Map<string, TimeslotDto>,
): number[] {
  if (!pattern) return [];
  const durations = new Set<number>();
  for (const set of pattern.compatible_timeslot_sets ?? []) {
    for (const slotId of set ?? []) {
      const slot = timeslotById.get(String(slotId));
      if (!slot || !timeslotMatchesDay(slot, day)) continue;
      durations.add(timeslotDurationMinutes(slot));
    }
  }
  return Array.from(durations);
}

function slotDurationMatchesAllowedLengths(
  durationMin: number,
  allowedDurations: number[],
): boolean {
  if (allowedDurations.length === 0) return true;
  return allowedDurations.some(
    (allowed) => Math.abs(durationMin - allowed) <= TIMESLOT_DURATION_MATCH_TOLERANCE_MIN,
  );
}

/**
 * Calendar background bands: hue encodes meeting length so 50-min, 75-min, and 2h blocks read at a glance.
 * `emphasis` raises alpha while dragging.
 */
function rgbaFillForTimeslotDuration(durationMin: number, emphasis: "normal" | "strong"): string {
  const d = Math.max(0, durationMin);
  const a = emphasis === "strong" ? 0.22 : 0.13;
  if (d <= 60) return `rgba(37, 99, 235, ${a})`;
  if (d <= 75) return `rgba(8, 145, 178, ${a})`;
  if (d <= 90) return `rgba(5, 150, 105, ${a})`;
  if (d <= 105) return `rgba(202, 138, 4, ${a})`;
  if (d <= 120) return `rgba(234, 88, 12, ${a})`;
  if (d <= 150) return `rgba(220, 38, 38, ${a})`;
  return `rgba(124, 58, 237, ${a})`;
}

function rgbaBorderForTimeslotDuration(durationMin: number): string {
  const d = Math.max(0, durationMin);
  if (d <= 60) return "rgba(29, 78, 216, 0.5)";
  if (d <= 75) return "rgba(14, 116, 144, 0.5)";
  if (d <= 90) return "rgba(4, 120, 87, 0.5)";
  if (d <= 105) return "rgba(161, 98, 7, 0.5)";
  if (d <= 120) return "rgba(194, 65, 12, 0.5)";
  if (d <= 150) return "rgba(185, 28, 28, 0.5)";
  return "rgba(109, 40, 217, 0.5)";
}

/**
 * Single source of truth for which slot lengths a dragged section may land on.
 * Shared by the highlight bands (`dragPossibleTimeslots`) and the drop snap
 * (`selectSlotNearMinutes`) so every highlighted band is a valid drop target
 * (issue C8). Falls back to the section's current on-grid duration when its
 * meeting pattern has no compatible slots for the day.
 */
function getAllowedSlotDurationsForDrag(
  sectionId: string,
  assignments: CalendarAssignmentMap,
  data: SolverDataDto,
  solverInput: SchedulingInput | null,
  selectedDay: Day,
  timeslotById: Map<string, TimeslotDto>,
  allDayEvents: CalendarEvent[],
): number[] {
  const section = data.sections.find((entry) => entry.id === sectionId);
  const patternId =
    assignments[sectionId]?.meeting_pattern_id?.trim() ||
    section?.previous_meeting_pattern?.trim() ||
    "";
  const pattern = solverInput?.meeting_patterns?.find((entry) => entry.id === patternId);
  let allowedDurations = meetingPatternSlotDurationsForDay(pattern, selectedDay, timeslotById);
  if (allowedDurations.length === 0) {
    const dragged = findCalendarEventBySectionId(allDayEvents, sectionId);
    if (dragged) {
      allowedDurations = [Math.max(0, dragged.end - dragged.start)];
    }
  }
  return allowedDurations;
}

function selectSlotNearMinutes(
  timeslots: TimeslotDto[],
  selectedDay: Day,
  allowedDurations: number[],
  dropMinutes: number,
): TimeslotWithMinutes | null {
  const daySlots = timeslots
    .filter((slot) => timeslotMatchesDay(slot, selectedDay))
    .map((slot) => ({
      ...slot,
      start: parseMinutes(slot.start_time),
      end: parseMinutes(slot.end_time),
    }))
    .filter((slot) =>
      slotDurationMatchesAllowedLengths(Math.max(0, slot.end - slot.start), allowedDurations),
    );
  if (daySlots.length === 0) return null;
  return daySlots.sort(
    (a, b) => Math.abs(a.start - dropMinutes) - Math.abs(b.start - dropMinutes),
  )[0];
}

function selectAnySlotNearMinutes(
  timeslots: TimeslotDto[],
  selectedDay: Day,
  dropMinutes: number,
): TimeslotWithMinutes | null {
  const daySlots = timeslots
    .filter((slot) => timeslotMatchesDay(slot, selectedDay))
    .map((slot) => ({
      ...slot,
      start: parseMinutes(slot.start_time),
      end: parseMinutes(slot.end_time),
    }));
  if (daySlots.length === 0) return null;
  return daySlots.sort(
    (a, b) => Math.abs(a.start - dropMinutes) - Math.abs(b.start - dropMinutes),
  )[0];
}

const EVENT_HEIGHT_PX = 70;
const EVENT_GAP_PX = 8;
const EVENT_TOP_PADDING_PX = 12;
const MIN_TRACK_HEIGHT_PX = 240;
/** Pixels of movement before drag mode (timeslot highlights) activates. */
const CALENDAR_DRAG_MOVE_THRESHOLD_PX = 14;
const TIMESLOT_DURATION_MATCH_TOLERANCE_MIN = 5;
type DepartmentPalette = {
  cardBg: string;
  cardBorder: string;
  printBg: string;
  printBorder: string;
  cardPattern: string;
};

const DISTINCT_SOLID_DEPARTMENT_PALETTE: Array<{
  cardBg: string;
  cardBorder: string;
  printBg: string;
  printBorder: string;
}> = [
  { cardBg: "#dbeafe", cardBorder: "#1d4ed8", printBg: "#dbeafe", printBorder: "#1d4ed8" },
  { cardBg: "#dcfce7", cardBorder: "#16a34a", printBg: "#dcfce7", printBorder: "#16a34a" },
  { cardBg: "#fef3c7", cardBorder: "#d97706", printBg: "#fef3c7", printBorder: "#d97706" },
  { cardBg: "#ffe4e6", cardBorder: "#e11d48", printBg: "#ffe4e6", printBorder: "#e11d48" },
  { cardBg: "#e0e7ff", cardBorder: "#4338ca", printBg: "#e0e7ff", printBorder: "#4338ca" },
  { cardBg: "#cffafe", cardBorder: "#0891b2", printBg: "#cffafe", printBorder: "#0891b2" },
  { cardBg: "#ede9fe", cardBorder: "#7c3aed", printBg: "#ede9fe", printBorder: "#7c3aed" },
  { cardBg: "#ffedd5", cardBorder: "#ea580c", printBg: "#ffedd5", printBorder: "#ea580c" },
  { cardBg: "#ecfccb", cardBorder: "#4d7c0f", printBg: "#ecfccb", printBorder: "#4d7c0f" },
  { cardBg: "#fae8ff", cardBorder: "#a21caf", printBg: "#fae8ff", printBorder: "#a21caf" },
  { cardBg: "#fce7f3", cardBorder: "#be185d", printBg: "#fce7f3", printBorder: "#be185d" },
  { cardBg: "#fef9c3", cardBorder: "#a16207", printBg: "#fef9c3", printBorder: "#a16207" },
];

/** Single normalized key per academic department (not per course). */
function departmentColorKey(section: { department?: string | null; course_id: string | number }): string {
  const d = (section.department ?? "").trim();
  if (d) return d.toUpperCase();
  return "UNSPECIFIED";
}

/** Label for legend: explicit department text only. */
function departmentLegendLabel(section: { department?: string | null; course_id: string | number }): string {
  const d = (section.department ?? "").trim();
  if (d) return d;
  return "Unspecified";
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function paletteForDepartmentKey(key: string, includePattern: boolean): DepartmentPalette {
  const hash = hashString(key);
  // Deterministic hue with offsets from hash bits to spread close keys.
  const hue = (hash * 137.508 + ((hash >>> 8) % 29)) % 360;
  const sat = 66 + (hash % 10); // 66..75
  const cardLight = 92 - (hash % 4); // 89..92
  const borderLight = 42 + (hash % 9); // 42..50
  const printLight = 90 - (hash % 4); // 87..90
  const printBorderLight = 38 + (hash % 9); // 38..46
  const patternFamily = hash % 4;

  let cardPattern = "none";
  if (includePattern && patternFamily === 1) {
    // subtle diagonal hatch
    cardPattern =
      "repeating-linear-gradient(45deg, rgba(15, 23, 42, 0.05) 0, rgba(15, 23, 42, 0.05) 2px, transparent 2px, transparent 7px)";
  } else if (includePattern && patternFamily === 2) {
    // subtle reverse diagonal hatch
    cardPattern =
      "repeating-linear-gradient(-45deg, rgba(15, 23, 42, 0.045) 0, rgba(15, 23, 42, 0.045) 2px, transparent 2px, transparent 8px)";
  } else if (includePattern && patternFamily === 3) {
    // subtle vertical stripes
    cardPattern =
      "repeating-linear-gradient(90deg, rgba(15, 23, 42, 0.045) 0, rgba(15, 23, 42, 0.045) 1px, transparent 1px, transparent 6px)";
  }

  return {
    cardBg: `hsl(${hue.toFixed(1)} ${sat}% ${cardLight}%)`,
    cardBorder: `hsl(${hue.toFixed(1)} ${Math.min(sat + 2, 82)}% ${borderLight}%)`,
    printBg: `hsl(${hue.toFixed(1)} ${Math.max(sat - 8, 45)}% ${printLight}%)`,
    printBorder: `hsl(${hue.toFixed(1)} ${Math.min(sat + 4, 84)}% ${printBorderLight}%)`,
    cardPattern,
  };
}

function solidPaletteAt(index: number): DepartmentPalette {
  const swatch = DISTINCT_SOLID_DEPARTMENT_PALETTE[
    index % DISTINCT_SOLID_DEPARTMENT_PALETTE.length
  ];
  return {
    cardBg: swatch.cardBg,
    cardBorder: swatch.cardBorder,
    printBg: swatch.printBg,
    printBorder: swatch.printBorder,
    cardPattern: "none",
  };
}

const CALENDAR_NAVBAR_SLOT_ID = "calendar-navbar-slot";

/** Renders Undo/Redo into the sticky navbar (see `Navbar`); only mounted on the calendar page. */
function CalendarHistoryNavbarPortal({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setSlot(document.getElementById(CALENDAR_NAVBAR_SLOT_ID));
  }, []);

  if (!slot) return null;

  const iconBtnBase =
    "flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors";
  const iconBtnEnabled =
    "border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-default-200 dark:bg-default-100 dark:text-foreground dark:hover:bg-default-200";
  const iconBtnDisabled =
    "cursor-not-allowed border-slate-200/70 bg-slate-50 text-slate-300 dark:border-default-100 dark:bg-default-50 dark:text-default-400";

  return createPortal(
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={!canUndo}
        onClick={onUndo}
        className={clsx(iconBtnBase, canUndo ? iconBtnEnabled : iconBtnDisabled)}
        title={canUndo ? "Undo last manual calendar change" : "Nothing to undo"}
        aria-label={canUndo ? "Undo last manual calendar change" : "Nothing to undo"}
      >
        <Undo2 className="size-4 shrink-0" aria-hidden />
      </button>
      <button
        type="button"
        disabled={!canRedo}
        onClick={onRedo}
        className={clsx(iconBtnBase, canRedo ? iconBtnEnabled : iconBtnDisabled)}
        title={canRedo ? "Redo last undone calendar change" : "Nothing to redo"}
        aria-label={canRedo ? "Redo last undone calendar change" : "Nothing to redo"}
      >
        <Redo2 className="size-4 shrink-0" aria-hidden />
      </button>
    </div>,
    slot,
  );
}

type CalendarDragFeedbackState = {
  status: "neutral" | "valid" | "warning" | "invalid";
  message: string | null;
};

/**
 * Scans a single day's rendered events for conflicts — two events that overlap in
 * time while sharing the same room (double-booking) or the same instructor
 * (double-teaching). Cross-list groups are already merged into one event, so their
 * members never conflict with each other. Used to re-surface conflicts after
 * undo/redo, when there's no active drag to compute them.
 */
function computeCalendarDayConflicts(events: CalendarEvent[]): {
  sectionIds: Set<string>;
  hasRoomConflict: boolean;
  hasInstructorConflict: boolean;
} {
  const sectionIds = new Set<string>();
  let hasRoomConflict = false;
  let hasInstructorConflict = false;

  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const a = events[i];
      const b = events[j];
      const overlaps = a.start < b.end && a.end > b.start;
      if (!overlaps) continue;

      const roomA = a.section.room_id ?? "";
      const roomB = b.section.room_id ?? "";
      const sameRoom = Boolean(roomA) && roomA === roomB;

      const instructorsA = new Set(calendarEventInstructorIds(a));
      const sharedInstructor = calendarEventInstructorIds(b).some((id) =>
        instructorsA.has(id),
      );

      if (!sameRoom && !sharedInstructor) continue;
      if (sameRoom) hasRoomConflict = true;
      if (sharedInstructor) hasInstructorConflict = true;
      for (const id of calendarEventSectionIds(a)) sectionIds.add(id);
      for (const id of calendarEventSectionIds(b)) sectionIds.add(id);
    }
  }

  return { sectionIds, hasRoomConflict, hasInstructorConflict };
}

/** Fixed below the navbar so valid/invalid drag messages stay visible while the calendar scrolls. */
function CalendarDragFeedbackToastPortal({
  mountedOn,
  dragFeedback,
  onDismiss,
  action,
}: {
  mountedOn: HTMLElement | null;
  dragFeedback: CalendarDragFeedbackState;
  onDismiss: () => void;
  action?: { label: string; onClick: () => void } | null;
}) {
  if (!mountedOn) return null;
  const line = dragFeedback.message;
  const isError = dragFeedback.status === "invalid";
  const isWarning = dragFeedback.status === "warning";
  const isValid = dragFeedback.status === "valid";
  const toastKey = `${dragFeedback.status}\u001f${dragFeedback.message ?? ""}`;

  return createPortal(
    <AnimatePresence>
      {line ? (
        <motion.div
          key={toastKey}
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-16 z-[45] flex justify-center px-4 sm:px-6 pt-2"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className={clsx(
              "pointer-events-auto flex w-full max-w-3xl items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md",
              isError &&
                "border-red-200 bg-red-50/95 text-red-800 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200",
              isWarning &&
                "border-amber-200 bg-amber-50/95 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100",
              isValid &&
                "border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100",
              !isError &&
                !isWarning &&
                !isValid &&
                "border-slate-200 bg-white/95 text-slate-800 dark:border-default-200 dark:bg-default-100/95 dark:text-foreground",
            )}
          >
            <span className="min-w-0 flex-1 leading-snug">{line}</span>
            {action ? (
              <button
                type="button"
                className={clsx(
                  "shrink-0 rounded-md border px-2.5 py-1 text-xs font-bold transition-colors",
                  isWarning
                    ? "border-amber-300 bg-amber-100/70 text-amber-900 hover:bg-amber-200/70 dark:border-amber-500/50 dark:bg-amber-500/20 dark:text-amber-100 dark:hover:bg-amber-500/30"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-default-200 dark:bg-default-100 dark:text-foreground",
                )}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ) : null}
            <button
              type="button"
              className={clsx(
                "shrink-0 rounded-md p-0.5",
                isError &&
                  "text-red-700/80 hover:bg-red-100/80 hover:text-red-900 dark:text-red-200 dark:hover:bg-red-500/20",
                isWarning &&
                  "text-amber-700/80 hover:bg-amber-100/80 hover:text-amber-900 dark:text-amber-200 dark:hover:bg-amber-500/20",
                isValid &&
                  "text-emerald-700/80 hover:bg-emerald-100/80 hover:text-emerald-900 dark:text-emerald-200 dark:hover:bg-emerald-500/20",
                !isError &&
                  !isWarning &&
                  !isValid &&
                  "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-default-400 dark:hover:bg-default-200/40",
              )}
              onClick={onDismiss}
              aria-label="Dismiss message"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    mountedOn,
  );
}

export default function CalendarPage() {
  type AssignmentMap = CalendarAssignmentMap;

  const router = useRouter();
  const { user } = useAuth();
  const { begin: beginSolverProgress, succeed: succeedSolverProgress, fail: failSolverProgress } =
    useSolverProgress();
  const [lockedSectionIds, setLockedSectionIds] = useState<string[]>([]);
  const [solverRunStatus, setSolverRunStatus] = useState<"idle" | "loading">("idle");
  const solverLock = useSolverLock();
  const solverBusyRemote = solverLock.active && solverRunStatus !== "loading";
  const { autoSaveEnabled, recordOwnServerWrite } = useSchedulingData();
  const [solverRunError, setSolverRunError] = useState<string | null>(null);
  // Cross-user shared schedule: newest solver result published by any live user.
  const sharedScheduleMeta = useSharedScheduleMeta();
  // Highest shared revision already reflected on this page (applied or authored).
  const appliedSharedRevisionRef = useRef(0);
  // Adopt the current shared revision as baseline on first poll so we only react
  // to runs that happen while this user is live (avoids clobbering on open).
  const sharedInitializedRef = useRef(false);
  // True while the current view came from History (protect it from auto-sync).
  const historyViewActiveRef = useRef(false);
  // Signature of the assignment map at the last successful "Save to History".
  // Used to tell whether the current iteration is unsaved before a re-run.
  const [lastHistorySavedSignature, setLastHistorySavedSignature] = useState<string | null>(null);
  // Pending shared schedule from another user awaiting the user's decision
  // (shown when auto-applying would discard local edits or a history view).
  const [incomingShared, setIncomingShared] = useState<{
    revision: number;
    ranBy: string | null;
  } | null>(null);
  // Run Solver confirmation prompt (warns about unsaved iteration + save option).
  const [runSolverPrompt, setRunSolverPrompt] = useState<{
    hasUnsavedIteration: boolean;
  } | null>(null);
  const [calendarContextMenu, setCalendarContextMenu] = useState<{
    clientX: number;
    clientY: number;
    sectionId: string;
  } | null>(null);
  const [saveScheduleModal, setSaveScheduleModal] = useState<SaveScheduleModalState>({
    isOpen: false,
    isSaving: false,
    error: null,
    draft: {
      name: "",
      scheduleDate: todayAsIsoDate(),
    },
  });

  const stateKeyForUndo = useCallback(
    (
      a: AssignmentMap,
      solverTs: Record<string, string[]>,
    ): string => {
      const normalizeAssignments = Object.entries(a)
        .sort(([sa], [sb]) => sa.localeCompare(sb))
        .map(([sectionId, v]) => ({
          sectionId,
          room_id: v.room_id || "",
          meeting_pattern_id: v.meeting_pattern_id || "",
          timeslot_ids: [...(v.timeslot_ids ?? [])].slice().sort(),
        }));
      const normalizeSolverTs = Object.entries(solverTs)
        .sort(([sa], [sb]) => sa.localeCompare(sb))
        .map(([sectionId, ids]) => ({
          sectionId,
          timeslot_ids: [...(ids ?? [])].slice().sort(),
        }));
      return JSON.stringify({ a: normalizeAssignments, s: normalizeSolverTs });
    },
    [],
  );

  type UndoSnapshot = {
    key: string;
    assignmentsBySection: AssignmentMap;
    solverTimeslotIdsBySection: Record<string, string[]>;
    backendSaveMessage: { type: "success" | "error"; text: string } | null;
    // Enriched history: the exact drag toast + conflict rings that were showing
    // for this state, so undo/redo restores them without a re-scan (issue C7).
    // Optional so older snapshots (pushed before enrichment) fall back to the
    // `computeCalendarDayConflicts` rescan path.
    dragFeedback?: CalendarDragFeedbackState;
    conflictSectionIds?: string[];
  };

  const [selectedDay, setSelectedDay] = useState<Day>("Mon");
  const [data, setData] = useState<SolverDataDto | null>(null);
  const [solverInput, setSolverInput] = useState<SchedulingInput | null>(null);
  const [assignmentsBySection, setAssignmentsBySection] = useState<AssignmentMap>({});
  const [baselineAssignments, setBaselineAssignments] = useState<AssignmentMap>({});
  const [error, setError] = useState<string | null>(null);
  const [solverTimeslotIdsBySection, setSolverTimeslotIdsBySection] = useState<
    Record<string, string[]>
  >({});
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const undoStackRef = useRef<UndoSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<UndoSnapshot[]>([]);
  const redoStackRef = useRef<UndoSnapshot[]>([]);

  // Shared push used by every mutation path (drag, click, pattern-apply) so all
  // of them record the same enriched snapshot (assignments + feedback + rings)
  // and consistently clear the redo stack on a new action.
  const pushUndoSnapshot = useCallback(
    (snap: {
      assignmentsBySection: AssignmentMap;
      solverTimeslotIdsBySection: Record<string, string[]>;
      backendSaveMessage: { type: "success" | "error"; text: string } | null;
      dragFeedback: CalendarDragFeedbackState;
      conflictSectionIds: Set<string> | string[];
    }) => {
      setRedoStack([]);
      redoStackRef.current = [];
      setUndoStack((prev) => {
        const key = stateKeyForUndo(
          snap.assignmentsBySection,
          snap.solverTimeslotIdsBySection,
        );
        const lastKey = prev.length ? prev[prev.length - 1]?.key : null;
        if (lastKey === key) return prev;
        const entry: UndoSnapshot = {
          key,
          assignmentsBySection: snap.assignmentsBySection,
          solverTimeslotIdsBySection: snap.solverTimeslotIdsBySection,
          backendSaveMessage: snap.backendSaveMessage,
          dragFeedback: snap.dragFeedback,
          conflictSectionIds: Array.isArray(snap.conflictSectionIds)
            ? snap.conflictSectionIds
            : Array.from(snap.conflictSectionIds),
        };
        const next = [...prev, entry];
        const trimmed = next.length > 25 ? next.slice(next.length - 25) : next;
        undoStackRef.current = trimmed;
        return trimmed;
      });
    },
    [stateKeyForUndo],
  );
  // Section ids to visually flag after a placement creates a conflict (instructor
  // double-booking or room overlap) so the user can spot both sides of the clash.
  const [conflictSectionIds, setConflictSectionIds] = useState<Set<string>>(() => new Set());
  // Bumped after undo/redo to request a full day conflict re-scan (no active drag
  // computes conflicts in that case). Paired with a ref so unrelated day/event
  // changes don't trigger the scan.
  const conflictRescanRef = useRef(false);
  const [conflictRescanNonce, setConflictRescanNonce] = useState(0);
  const [scheduleDrawerOpen, setScheduleDrawerOpen] = useState<boolean>(false);
  // Mount/enter states drive a smooth slide: `drawerRender` keeps the panel in the
  // DOM through the exit animation; `drawerEntered` toggles the transform.
  const [drawerRender, setDrawerRender] = useState<boolean>(false);
  const [drawerEntered, setDrawerEntered] = useState<boolean>(false);
  const [drawerSearch, setDrawerSearch] = useState<string>("");
  const [dragFeedback, setDragFeedback] = useState<CalendarDragFeedbackState>({
    status: "neutral",
    message: null,
  });
  /** Pointer-driven drag: no HTML5 ghost; block snaps on the grid. */
  type CalendarDragPreview = {
    targetRoomId: string;
    slotId: string;
    startMin: number;
    endMin: number;
  };
  type CalendarDragState = {
    sectionId: string;
    pointerId: number;
    startX: number;
    startY: number;
    hasMoved: boolean;
    originLane: number;
    preview: CalendarDragPreview;
  };
  type PlacementPreview = {
    targetRoomId: string;
    slotId: string;
    startMin: number;
    endMin: number;
    isValid: boolean;
    severity: PlacementSeverity;
    message: string | null;
  };
type MeetingPatternPlacementOption = {
  key: string;
  meetingPatternId: string;
  timeslotIds: string[];
  label: string;
};
// One row per other pattern day when offering to apply a per-day edit across the
// whole meeting pattern (issue: multi-day pattern consistency).
type PatternDayApplySeverity = "ok" | "warn" | "block" | "none";
type PatternDayApplyRow = {
  day: Day;
  targetSlotId: string | null;
  timeLabel: string;
  severity: PatternDayApplySeverity;
  message: string;
  selected: boolean;
};
  const [calendarDrag, setCalendarDrag] = useState<CalendarDragState | null>(null);
  const [pendingPlacementSectionId, setPendingPlacementSectionId] = useState<string | null>(null);
  const [placementPreview, setPlacementPreview] = useState<PlacementPreview | null>(null);
  const roomTrackRefs = useRef<Record<string, HTMLDivElement | null>>({});
  /** Vertical scroll container for the room grid (`overflow-y-auto`). */
  const calendarScrollContainerRef = useRef<HTMLDivElement | null>(null);
  /** Latest pointer Y during calendar drag (document listener; works when source card is `pointer-events-none`). */
  const calendarDragPointerYRef = useRef<number | null>(null);
  const suppressCardClickRef = useRef(false);
  const setRoomTrackRef = useCallback((roomId: string, el: HTMLDivElement | null) => {
    roomTrackRefs.current[roomId] = el;
  }, []);
  const [isSavingBackend, setIsSavingBackend] = useState(false);
  const [backendSaveMessage, setBackendSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [selectedDepartmentKeys, setSelectedDepartmentKeys] = useState<string[]>([]);
  const [selectedInstructorIds, setSelectedInstructorIds] = useState<string[]>([]);
  const [hoveredDepartmentKey, setHoveredDepartmentKey] = useState<string | null>(null);
  const [selectedLegendDepartmentKeys, setSelectedLegendDepartmentKeys] = useState<string[]>([]);
  const [crosslistPickerModal, setCrosslistPickerModal] = useState<{
    crosslistGroupId: string;
    memberSections: SectionDto[];
  } | null>(null);
  const [sectionModal, setSectionModal] = useState<{
    mode: "create" | "edit";
    initialSectionId?: string;
    draft: SectionFormDraft;
    returnToCrosslistGroupId?: string;
  } | null>(null);
  const [sectionModalError, setSectionModalError] = useState<string | null>(null);
  const [isSavingSection, setIsSavingSection] = useState(false);
  const [meetingPatternSelectionModal, setMeetingPatternSelectionModal] = useState<{
    sectionId: string;
    roomId: string;
    anchorSlotId: string;
    options: MeetingPatternPlacementOption[];
    selectedOptionKey: string;
    // Pre-click snapshot used to revert the deferred placement if the user
    // dismisses the modal without choosing a pattern (issue C5), and to push a
    // single undo entry covering place+choose-pattern once applied (issue C6).
    revertAssignments: AssignmentMap;
    revertSolverTimeslots: Record<string, string[]>;
    revertBackendSaveMessage: { type: "success" | "error"; text: string } | null;
    revertDragFeedback: CalendarDragFeedbackState;
    revertConflictSectionIds: string[];
  } | null>(null);
  const [meetingPatternSelectionError, setMeetingPatternSelectionError] = useState<string | null>(null);
  // After a single day of a multi-day pattern is moved, remember enough to offer
  // "apply this time to the pattern's other days". Drives the toast action button.
  const [patternApplyPrompt, setPatternApplyPrompt] = useState<{
    sectionId: string;
    roomId: string;
    anchorSlotId: string;
    anchorDay: Day;
    otherDays: Day[];
  } | null>(null);
  // Open per-day breakdown modal: shows which pattern days can take the new time
  // cleanly, which would conflict, and which have no matching timeslot.
  const [patternApplyModal, setPatternApplyModal] = useState<{
    sectionId: string;
    roomId: string;
    anchorDay: Day;
    anchorTimeLabel: string;
    courseLabel: string;
    rows: PatternDayApplyRow[];
  } | null>(null);
  // Confirmation shown before locking a section whose days are staggered, so the
  // user can double-check the per-day times before pinning them for the solver.
  const [staggeredLockConfirm, setStaggeredLockConfirm] = useState<{
    sectionId: string;
    courseLabel: string;
    dayTimes: { day: Day; timeLabel: string }[];
  } | null>(null);
  const [toolbarActionHint, setToolbarActionHint] = useState<string | null>(null);
  // Keep multiple pinned highlights; hovering adds a temporary highlight.
  const activeLegendDepartmentKeys = useMemo(() => {
    const keys = new Set(selectedLegendDepartmentKeys);
    if (hoveredDepartmentKey) keys.add(hoveredDepartmentKey);
    return keys;
  }, [hoveredDepartmentKey, selectedLegendDepartmentKeys]);

  const [dragFeedbackToastMount, setDragFeedbackToastMount] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setDragFeedbackToastMount(document.body);
  }, []);

  // Rebuild the full calendar view (data, assignments, locks, undo/redo) from a
  // solver-run snapshot. Shared by the localStorage hydration path and the
  // cross-user shared-schedule sync so both stay identical.
  const applyRunSnapshot = useCallback((parsed: LastSolverRun) => {
    // Prefer the latest editor draft for `slot_type` so UI updates
    // (short vs long blocks) reflect immediately without rerunning solver.
    let slotTypeByTimeslotId = new Map<string, string>();
    try {
      const draftRaw = localStorage.getItem("wsom-scheduling-data");
      if (draftRaw) {
        const draft = JSON.parse(draftRaw) as Partial<SchedulingInput>;
        const draftSlots = (draft?.timeslots ?? []) as Array<{ id: string; slot_type?: string }>;
        slotTypeByTimeslotId = new Map(
          draftSlots
            .filter((t) => !!t?.id && typeof t.slot_type === "string" && t.slot_type.trim())
            .map((t) => [String(t.id), String(t.slot_type)]),
        );
      }
    } catch {
      // Ignore malformed local draft payload.
    }
    const assignmentBySectionId = new Map(
      parsed.solution.assignments.map((assignment) => [assignment.section_id, assignment]),
    );
    const allTimeslotIdsBySection = Object.fromEntries(
      parsed.solution.assignments.map((assignment) => [
        assignment.section_id,
        assignment.timeslot_ids,
      ]),
    );
    const nextAssignments = Object.fromEntries(
      parsed.solution.assignments.map((assignment) => [
        assignment.section_id,
        {
          timeslot_ids: assignment.timeslot_ids,
          room_id: assignment.room_id,
          meeting_pattern_id: assignment.meeting_pattern_id,
        },
      ]),
    );

    const sectionsFromSolver = parsed.input.sections.map((section) => {
      const assignment = assignmentBySectionId.get(section.id);
      return {
        id: section.id,
        course_id: section.course_id,
        department: section.department ?? "",
        section_code: section.section_code,
        instructor_id: section.instructor_id,
        expected_enrollment: section.expected_enrollment,
        enrollment_cap: section.enrollment_cap,
        allowed_meeting_patterns: section.allowed_meeting_patterns ?? [],
        previous_meeting_pattern:
          assignment?.meeting_pattern_id ?? section.previous_meeting_pattern ?? null,
        room_requirements: section.room_requirements ?? [],
        crosslist_group_id: section.crosslist_group_id ?? null,
        tags: section.tags ?? [],
        state: section.state ?? "active",
        room_id: assignment?.room_id ?? null,
        // Legacy field retained for compatibility with existing rendering.
        timeslot_id: assignment?.timeslot_ids?.[0] ?? null,
      };
    });

    const timeslotsFromSolver = parsed.input.timeslots.map((timeslot) => ({
      id: timeslot.id,
      day: timeslot.day,
      start_time: timeslot.start_time,
      end_time: timeslot.end_time,
      slot_type: slotTypeByTimeslotId.get(timeslot.id) ?? timeslot.slot_type ?? "standard",
    }));

    const instructorsFromSolver = parsed.input.instructors.map((instructor) => {
      const prefs = (instructor.preferences ?? {}) as {
        preferred_times?: string[];
        preferred_days?: string[];
        preferred_patterns?: string[];
        max_teaching_days?: number;
        unavailable_times?: string[];
      };
      return {
        id: instructor.id,
        name: instructor.name || instructor.id,
        rank_type: instructor.rank_type,
        unavailable_times: instructor.unavailable_times ?? prefs.unavailable_times ?? [],
        max_teaching_days: prefs.max_teaching_days,
        preferences: {
          unavailable_times: prefs.unavailable_times ?? [],
          preferred_times: prefs.preferred_times ?? [],
          preferred_days: prefs.preferred_days ?? [],
          preferred_patterns: prefs.preferred_patterns ?? [],
          max_teaching_days: prefs.max_teaching_days,
        },
      };
    });
    const roomsFromSolver = parsed.input.rooms.map((room) => ({
      id: room.id,
      building: room.building,
      room_number: room.room_number,
      capacity: room.capacity,
    }));

    setSolverInput(parsed.input);
    setAssignmentsBySection(nextAssignments);
    setBaselineAssignments(nextAssignments);
    setSolverTimeslotIdsBySection(allTimeslotIdsBySection);
    setLockedSectionIds(Array.isArray(parsed.lockedSectionIds) ? parsed.lockedSectionIds : []);
    setUndoStack([]);
    undoStackRef.current = [];
    setRedoStack([]);
    redoStackRef.current = [];
    setData({
      sections: sectionsFromSolver,
      timeslots: timeslotsFromSolver,
      instructors: instructorsFromSolver,
      rooms: roomsFromSolver,
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (typeof window !== "undefined") {
          const raw = localStorage.getItem(LAST_SOLVER_RUN_STORAGE_KEY);
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as LastSolverRun;
              if (mounted) {
                // Remember which shared revision this local snapshot corresponds
                // to (if it came from a shared run) so we don't re-apply our own.
                if (typeof sessionStorage !== "undefined") {
                  const fromHistory = sessionStorage.getItem(VIEW_FROM_HISTORY_KEY) === "1";
                  historyViewActiveRef.current = fromHistory;
                  sessionStorage.removeItem(VIEW_FROM_HISTORY_KEY);
                }
                applyRunSnapshot(parsed);
                if (historyViewActiveRef.current) {
                  const sig = assignmentsSignature(
                    Object.fromEntries(
                      parsed.solution.assignments.map((assignment) => [
                        assignment.section_id,
                        {
                          timeslot_ids: assignment.timeslot_ids,
                          room_id: assignment.room_id,
                          meeting_pattern_id: assignment.meeting_pattern_id,
                        },
                      ]),
                    ),
                  );
                  setLastHistorySavedSignature(sig);
                }
                return;
              }
            } catch {
              // Ignore malformed local storage payload and fall back to API.
            }
          }
        }

        const res = await fetch("/api/data", { method: "GET" });
        const json = (await res.json()) as
          | { status: "ok"; data: SolverDataDto }
          | { status: "error"; errors: { code: string; message: string }[] };
        if (!res.ok || json.status !== "ok") {
          const message =
            json.status === "error"
              ? json.errors.map((e) => `${e.code}: ${e.message}`).join(" | ")
              : "Failed to load data.";
          throw new Error(message);
        }
        if (mounted) {
          const fallbackAssignments: AssignmentMap = Object.fromEntries(
            json.data.sections.map((section) => [
              section.id,
              {
                timeslot_ids: section.timeslot_id ? [section.timeslot_id] : [],
                room_id: section.room_id ?? "",
                meeting_pattern_id: section.previous_meeting_pattern ?? "",
              },
            ]),
          );
          setAssignmentsBySection(fallbackAssignments);
          setBaselineAssignments(fallbackAssignments);
          setLockedSectionIds([]);
          setUndoStack([]);
          undoStackRef.current = [];
          setRedoStack([]);
          redoStackRef.current = [];
          setData(json.data);
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Failed to load data.");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [applyRunSnapshot]);

  // Pull the newest shared schedule from the server and apply it to this page.
  const applySharedSnapshot = useCallback(async (): Promise<boolean> => {
    const full = await fetchSharedScheduleFull();
    if (!full || !full.snapshot) return false;
    const snapshot = full.snapshot as unknown as LastSolverRun;
    applyRunSnapshot(snapshot);
    try {
      localStorage.setItem(LAST_SOLVER_RUN_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // best-effort persistence
    }
    appliedSharedRevisionRef.current = full.revision;
    historyViewActiveRef.current = false;
    setLastHistorySavedSignature(null);
    setIncomingShared(null);
    setDragFeedback({
      status: "valid",
      message: full.ranBy
        ? `Schedule from ${full.ranBy} applied.`
        : "A new shared schedule was applied.",
    });
    return true;
  }, [applyRunSnapshot]);

  const timeslotById = useMemo(() => {
    const map = new Map<string, TimeslotDto>();
    data?.timeslots.forEach((t) => map.set(t.id, t));
    return map;
  }, [data]);

  const axisStart = SCHEDULING_WINDOW_START_HOUR * 60;
  const axisEnd = SCHEDULING_WINDOW_END_HOUR * 60;
  const axisRange = axisEnd - axisStart;

  const timeAxisLabels = Array.from(
    { length: Math.max(SCHEDULING_WINDOW_END_HOUR - SCHEDULING_WINDOW_START_HOUR, 0) },
    (_, idx) => {
      const h24 = SCHEDULING_WINDOW_START_HOUR + idx;
      const suffix = h24 >= 12 ? "PM" : "AM";
      const h12 = ((h24 + 11) % 12) + 1;
      return `${h12}${suffix}`;
    },
  );
  const hourSegments = timeAxisLabels.length;

  const instructorById = useMemo(() => {
    const map = new Map<string, InstructorDto>();
    data?.instructors.forEach((i) => map.set(i.id, i));
    return map;
  }, [data]);

  const sectionById = useMemo(() => {
    const map = new Map<string, SectionDto>();
    data?.sections.forEach((section) => map.set(section.id, section));
    return map;
  }, [data]);

  const findBlockedPlacementMessage = useCallback(
    (
      sectionId: string,
      targetRoomId: string,
      slot: TimeslotWithMinutes,
      day: Day = selectedDay,
    ): string | null => {
      if (!solverInput) return null;
      const section = sectionById.get(sectionId);
      if (!section) return null;
      for (const blocked of solverInput.blocked_times ?? []) {
        const sectionScopeMatch = blockedRuleMatchesSection(blocked, section, targetRoomId);
        if (!sectionScopeMatch.matches) continue;
        if (!blockedRuleOverlapsSlot(blocked, slot, day)) continue;
        const reason = String(blocked.reason ?? "").trim();
        const title = [section.department, String(section.course_id)].filter(Boolean).join(" ").trim();
        const timeRange = `${formatTimeAmPm(slot.start_time)}-${formatTimeAmPm(slot.end_time)}`;
        const reasonText = reason ? ` Reason: ${reason}.` : "";
        return `Cannot place ${title || section.id} into ${day} ${timeRange}. This timeslot is blocked by ${sectionScopeMatch.label}.${reasonText}`;
      }
      return null;
    },
    [sectionById, selectedDay, solverInput],
  );

  const buildMeetingPatternOptionsForPlacement = useCallback(
    (sectionId: string, placedSlotId: string): MeetingPatternPlacementOption[] => {
      if (!solverInput) return [];
      const section = sectionById.get(sectionId);
      if (!section) return [];
      const allowedPatternSet =
        section.allowed_meeting_patterns && section.allowed_meeting_patterns.length > 0
          ? new Set(section.allowed_meeting_patterns)
          : null;
      const options: MeetingPatternPlacementOption[] = [];
      for (const pattern of solverInput.meeting_patterns ?? []) {
        if (allowedPatternSet && !allowedPatternSet.has(pattern.id)) continue;
        if (!meetingPatternIncludesDay(pattern, selectedDay)) continue;
        for (const set of pattern.compatible_timeslot_sets ?? []) {
          const normalizedSet = (set ?? []).map((id) => String(id)).filter(Boolean);
          if (!normalizedSet.includes(placedSlotId)) continue;
          const slotLabels = normalizedSet
            .map((slotId) => {
              const slot = timeslotById.get(slotId);
              if (!slot) return slotId;
              const daysLabel = String(slot.days ?? slot.day ?? "").trim() || "?";
              return `${daysLabel} ${formatTimeAmPm(slot.start_time)}-${formatTimeAmPm(slot.end_time)}`;
            })
            .join(", ");
          options.push({
            key: `${pattern.id}::${normalizedSet.join("|")}`,
            meetingPatternId: pattern.id,
            timeslotIds: normalizedSet,
            label: `${pattern.id} (${slotLabels})`,
          });
        }
      }
      return options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    },
    [sectionById, selectedDay, solverInput, timeslotById],
  );

  const validatePatternPlacement = useCallback(
    (
      sectionId: string,
      targetRoomId: string,
      nextTimeslotIds: string[],
      baseAssignments: AssignmentMap,
    ): { ok: true } | { ok: false; message: string } => {
      if (!data) return { ok: false, message: "Calendar data is unavailable." };
      const linkedSectionIds = crosslistPeerSectionIds(sectionId, data.sections);
      const linkedSectionIdSet = new Set(linkedSectionIds);
      const selectedSlotMap = new Map<string, TimeslotDto>();
      for (const slotId of nextTimeslotIds) {
        const slot = timeslotById.get(slotId);
        if (!slot) return { ok: false, message: `Timeslot '${slotId}' is missing from the calendar.` };
        selectedSlotMap.set(slotId, slot);
      }

      // Shared overlap primitive so drag, click, and pattern paths agree on what
      // "overlapping times" means.
      const slotOverlaps = (a: TimeslotDto, b: TimeslotDto): boolean => {
        const days = DAYS.filter((day) => timeslotMatchesDay(a, day) && timeslotMatchesDay(b, day));
        if (days.length === 0) return false;
        return minutesOverlap(
          parseMinutes(a.start_time),
          parseMinutes(a.end_time),
          parseMinutes(b.start_time),
          parseMinutes(b.end_time),
        );
      };

      for (const linkedSectionId of linkedSectionIds) {
        for (const slotId of nextTimeslotIds) {
          const slot = selectedSlotMap.get(slotId);
          if (!slot) continue;
          const slotWithMinutes: TimeslotWithMinutes = {
            ...slot,
            start: parseMinutes(slot.start_time),
            end: parseMinutes(slot.end_time),
          };
          const daysForSlot = DAYS.filter((day) => timeslotMatchesDay(slot, day));
          for (const day of daysForSlot.length ? daysForSlot : [selectedDay]) {
            const blocked = findBlockedPlacementMessage(linkedSectionId, targetRoomId, slotWithMinutes, day);
            if (blocked) {
              return {
                ok: false,
                message: `${blocked} Suggested fix: choose a meeting pattern whose other day slots avoid blocked times.`,
              };
            }
          }
        }
      }

      for (const [otherSectionId, assignment] of Object.entries(baseAssignments)) {
        if (linkedSectionIdSet.has(otherSectionId)) continue;
        const otherRoomId = assignment?.room_id ?? "";
        if (otherRoomId !== targetRoomId) continue;
        const otherSlotIds = assignment?.timeslot_ids ?? [];
        for (const slotId of nextTimeslotIds) {
          const slot = selectedSlotMap.get(slotId);
          if (!slot) continue;
          for (const otherSlotId of otherSlotIds) {
            const otherSlot = timeslotById.get(otherSlotId);
            if (!otherSlot) continue;
            if (!slotOverlaps(slot, otherSlot)) continue;
            const section = sectionById.get(otherSectionId);
            const sectionLabel = [section?.department, String(section?.course_id ?? otherSectionId)]
              .filter(Boolean)
              .join(" ")
              .trim();
            return {
              ok: false,
              message: `Cannot apply this meeting pattern: it conflicts with ${sectionLabel || otherSectionId} in room ${targetRoomId}. Suggested fix: pick another meeting pattern option or place the section in a different room.`,
            };
          }
        }
      }

      return { ok: true };
    },
    [data, findBlockedPlacementMessage, sectionById, selectedDay, timeslotById],
  );

  const departmentFilterOptions = useMemo(() => {
    if (!data?.sections.length) return [] as { key: string; label: string }[];
    const byKey = new Map<string, string>();
    for (const section of data.sections) {
      const key = departmentColorKey(section);
      if (!byKey.has(key)) byKey.set(key, departmentLegendLabel(section));
    }
    return Array.from(byKey.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [data]);

  const professorFilterOptions = useMemo(() => {
    if (!data?.sections.length) return [] as { key: string; label: string }[];
    const usedInstructorIds = new Set(
      data.sections.map((section) => section.instructor_id).filter(Boolean),
    );
    return Array.from(usedInstructorIds)
      .map((id) => ({ key: id, label: instructorById.get(id)?.name?.trim() || id }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [data, instructorById]);

  const updateSectionModalDraft = useCallback(
    <K extends keyof SectionFormDraft>(field: K, value: SectionFormDraft[K]) => {
      setSectionModal((prev) => (prev ? { ...prev, draft: { ...prev.draft, [field]: value } } : prev));
    },
    [],
  );

  const openCreateSectionModal = useCallback(() => {
    setSectionModalError(null);
    setSectionModal({
      mode: "create",
      draft: {
        id: "",
        department: "",
        course_id: "",
        section_code: "A",
        instructor_id: "",
        expected_enrollment: 20,
        enrollment_cap: 30,
        allowed_meeting_patterns: "",
        room_requirements: "",
        crosslist_group_id: "",
        tags: "",
      },
    });
  }, []);

  const openCrosslistGroupPicker = useCallback(
    (crosslistGroupId: string, memberSections: SectionDto[]) => {
      setCrosslistPickerModal({ crosslistGroupId, memberSections });
    },
    [],
  );

  const openSectionEditorFromCrosslist = useCallback(
    (section: SectionDto, crosslistGroupId: string) => {
      setCrosslistPickerModal(null);
      setSectionModalError(null);
      setSectionModal({
        mode: "edit",
        initialSectionId: section.id,
        draft: toSectionFormDraft(section),
        returnToCrosslistGroupId: crosslistGroupId,
      });
    },
    [],
  );

  const returnToCrosslistPickerFromSectionModal = useCallback(() => {
    if (!sectionModal?.returnToCrosslistGroupId || !data) return;
    const crosslistGroupId = sectionModal.returnToCrosslistGroupId;
    const memberSections = data.sections.filter(
      (section) => String(section.crosslist_group_id ?? "").trim() === crosslistGroupId,
    );
    setSectionModal(null);
    setSectionModalError(null);
    openCrosslistGroupPicker(crosslistGroupId, memberSections);
  }, [data, openCrosslistGroupPicker, sectionModal?.returnToCrosslistGroupId]);

  const validateSectionDraft = useCallback(
    (
      draft: SectionFormDraft,
      mode: "create" | "edit",
      currentSectionId?: string,
    ): string | null => {
      const id = draft.id.trim();
      const courseId = draft.course_id.trim();
      const sectionCode = draft.section_code.trim();
      if (!id) return "Section ID is required.";
      if (!courseId) return "Course ID is required.";
      if (!sectionCode) return "Section code is required.";
      if (!draft.instructor_id.trim()) return "Instructor is required.";
      if (!instructorById.has(draft.instructor_id.trim())) {
        return "Instructor must be selected from existing instructors.";
      }
      if (!Number.isFinite(draft.expected_enrollment) || draft.expected_enrollment < 0) {
        return "Expected enrollment must be a non-negative number.";
      }
      if (!Number.isFinite(draft.enrollment_cap) || draft.enrollment_cap < 0) {
        return "Enrollment cap must be a non-negative number.";
      }
      if (draft.enrollment_cap < draft.expected_enrollment) {
        return "Enrollment cap must be greater than or equal to expected enrollment.";
      }
      const duplicate = data?.sections.find(
        (section) => section.id === id && (mode === "create" || section.id !== currentSectionId),
      );
      if (duplicate) return `Section ID '${id}' already exists.`;
      return null;
    },
    [data?.rooms, data?.sections, data?.timeslots, instructorById],
  );

  const persistSections = useCallback(async (sections: SectionDto[]) => {
    const response = await fetch("/api/update-sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections }),
    });
    const payload = (await response.json()) as
      | { status: "ok" }
      | { status: "error"; errors?: { message?: string }[] };
    if (!response.ok || payload.status === "error") {
      const message =
        payload.status === "error" && payload.errors?.length
          ? payload.errors.map((e) => e.message).filter(Boolean).join(" | ")
          : "Backend failed to update sections.";
      throw new Error(message);
    }
  }, []);

  const toSchedulingSections = useCallback(
    (sections: SectionDto[]): SchedulingInput["sections"] =>
      sections.map((section) => ({
        id: section.id,
        course_id: String(section.course_id),
        department: (section.department ?? "").trim(),
        section_code: section.section_code,
        instructor_id: section.instructor_id,
        expected_enrollment: section.expected_enrollment ?? 0,
        enrollment_cap: section.enrollment_cap ?? section.expected_enrollment ?? 0,
        allowed_meeting_patterns: section.allowed_meeting_patterns ?? [],
        previous_meeting_pattern: section.previous_meeting_pattern ?? undefined,
        room_requirements: section.room_requirements ?? [],
        crosslist_group_id: section.crosslist_group_id ?? null,
        tags: section.tags ?? [],
        state: normalizeSectionState(section.state),
      })),
    [],
  );

  const mergeSectionsWithAssignments = useCallback(
    (nextAssignments: AssignmentMap): SectionDto[] => {
      if (!data) return [];
      return data.sections.map((section) => {
        const assignment = nextAssignments[section.id];
        const nextMeetingPatternId =
          assignment?.meeting_pattern_id || section.previous_meeting_pattern || null;
        const nextAllowedPatterns = Array.from(
          new Set([
            ...(section.allowed_meeting_patterns ?? []),
            ...(nextMeetingPatternId ? [nextMeetingPatternId] : []),
          ]),
        );
        return {
          ...section,
          room_id: assignment?.room_id ?? section.room_id ?? null,
          timeslot_id: assignment?.timeslot_ids?.[0] ?? section.timeslot_id ?? null,
          previous_meeting_pattern: nextMeetingPatternId,
          allowed_meeting_patterns: nextAllowedPatterns,
        };
      });
    },
    [data],
  );

  const persistCalendarAssignments = useCallback(
    async (nextAssignments: AssignmentMap) => {
      if (!data) return;
      const mergedSections = mergeSectionsWithAssignments(nextAssignments);
      try {
        await persistSections(mergedSections);
        setData((prev) => (prev ? { ...prev, sections: mergedSections } : prev));
        if (solverInput) {
          const nextInput: SchedulingInput = {
            ...solverInput,
            sections: toSchedulingSections(mergedSections),
          };
          setSolverInput(nextInput);
        }
        if (typeof window !== "undefined") {
          await recordOwnServerWrite();
          window.dispatchEvent(new Event(SCHEDULING_DATA_REFRESH_EVENT));
        }
      } catch (err) {
        setBackendSaveMessage({
          type: "error",
          text:
            err instanceof Error
              ? `Calendar placement saved locally but failed to sync backend: ${err.message}`
              : "Calendar placement saved locally but failed to sync backend.",
        });
      }
    },
    [data, mergeSectionsWithAssignments, persistSections, recordOwnServerWrite, solverInput, toSchedulingSections],
  );

  const applyMeetingPatternSelection = useCallback(() => {
    if (!meetingPatternSelectionModal) return;
    const selection = meetingPatternSelectionModal.options.find(
      (option) => option.key === meetingPatternSelectionModal.selectedOptionKey,
    );
    if (!selection) {
      setMeetingPatternSelectionError("Select a meeting pattern option.");
      return;
    }
    const sectionId = meetingPatternSelectionModal.sectionId;
    const targetRoomId = meetingPatternSelectionModal.roomId;
    const nextTimeslotIds = Array.from(new Set(selection.timeslotIds));
    const validation = validatePatternPlacement(sectionId, targetRoomId, nextTimeslotIds, assignmentsBySection);
    if (!validation.ok) {
      setMeetingPatternSelectionError(validation.message);
      setDragFeedback({ status: "invalid", message: validation.message });
      return;
    }

    const linkedSectionIds = data ? crosslistPeerSectionIds(sectionId, data.sections) : [sectionId];
    const nextAssignments: AssignmentMap = { ...assignmentsBySection };
    for (const linkedSectionId of linkedSectionIds) {
      nextAssignments[linkedSectionId] = {
        timeslot_ids: [...nextTimeslotIds],
        room_id: targetRoomId,
        meeting_pattern_id: selection.meetingPatternId,
      };
    }
    // Push a single undo entry covering the whole place+choose-pattern action,
    // using the pre-click state captured on the modal, before persisting (C6).
    pushUndoSnapshot({
      assignmentsBySection: meetingPatternSelectionModal.revertAssignments,
      solverTimeslotIdsBySection: meetingPatternSelectionModal.revertSolverTimeslots,
      backendSaveMessage: meetingPatternSelectionModal.revertBackendSaveMessage,
      dragFeedback: meetingPatternSelectionModal.revertDragFeedback,
      conflictSectionIds: meetingPatternSelectionModal.revertConflictSectionIds,
    });
    setAssignmentsBySection(nextAssignments);
    setSolverTimeslotIdsBySection((prev) => ({
      ...prev,
      ...Object.fromEntries(
        linkedSectionIds.map((linkedSectionId) => [linkedSectionId, [...nextTimeslotIds]]),
      ),
    }));
    void persistCalendarAssignments(nextAssignments);
    setMeetingPatternSelectionModal(null);
    setMeetingPatternSelectionError(null);
    setDragFeedback({
      status: "valid",
      message: `Applied meeting pattern ${selection.meetingPatternId}. Section mapped to all compatible days and timeslots.`,
    });
    setBackendSaveMessage({
      type: "success",
      text: "Meeting pattern mapped successfully and synced to backend.",
    });
  }, [
    assignmentsBySection,
    data,
    meetingPatternSelectionModal,
    persistCalendarAssignments,
    pushUndoSnapshot,
    validatePatternPlacement,
  ]);

  // Dismissing the modal without choosing a pattern reverts the deferred (never
  // persisted) placement so the calendar matches its pre-click state (issue C5).
  const dismissMeetingPatternSelection = useCallback(() => {
    if (meetingPatternSelectionModal) {
      setAssignmentsBySection(meetingPatternSelectionModal.revertAssignments);
      setSolverTimeslotIdsBySection(meetingPatternSelectionModal.revertSolverTimeslots);
      setConflictSectionIds(new Set());
      setPendingPlacementSectionId(meetingPatternSelectionModal.sectionId);
      setPlacementPreview(null);
      setDragFeedback({
        status: "neutral",
        message:
          "Placement canceled — no meeting pattern was chosen, so the section was returned to its previous state. Click an available space to place it again.",
      });
      setBackendSaveMessage(null);
    }
    setMeetingPatternSelectionModal(null);
    setMeetingPatternSelectionError(null);
  }, [meetingPatternSelectionModal]);

  useEffect(() => {
    const validDepartmentKeys = new Set(departmentFilterOptions.map((option) => option.key));
    setSelectedDepartmentKeys((prev) => prev.filter((key) => validDepartmentKeys.has(key)));
  }, [departmentFilterOptions]);

  useEffect(() => {
    const validInstructorIds = new Set(professorFilterOptions.map((option) => option.key));
    setSelectedInstructorIds((prev) => prev.filter((id) => validInstructorIds.has(id)));
  }, [professorFilterOptions]);

  const sectionMatchesFilters = useCallback(
    (section: SectionDto) => {
      if (isSectionArchived(section)) {
        return false;
      }
      const departmentMatch =
        selectedDepartmentKeys.length === 0 ||
        selectedDepartmentKeys.includes(departmentColorKey(section));
      const instructorMatch =
        selectedInstructorIds.length === 0 ||
        selectedInstructorIds.includes(section.instructor_id);
      return departmentMatch && instructorMatch;
    },
    [selectedDepartmentKeys, selectedInstructorIds],
  );

  /** Shown under the PDF title when department and/or professor filters are active. */
  const printPdfFilterLines = useMemo(() => {
    const lines: { key: string; label: string; value: string }[] = [];
    if (selectedDepartmentKeys.length > 0) {
      const labels = selectedDepartmentKeys
        .map((k) => departmentFilterOptions.find((o) => o.key === k)?.label ?? k)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      lines.push({ key: "departments", label: "Departments", value: labels.join(", ") });
    }
    if (selectedInstructorIds.length > 0) {
      const labels = selectedInstructorIds
        .map((id) => professorFilterOptions.find((o) => o.key === id)?.label ?? id)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      lines.push({ key: "professors", label: "Professors", value: labels.join(", ") });
    }
    return lines;
  }, [selectedDepartmentKeys, selectedInstructorIds, departmentFilterOptions, professorFilterOptions]);

  const departmentPaletteByKey = useMemo(() => {
    const map = new Map<string, DepartmentPalette>();
    if (!data?.sections.length) return map;

    const keys = Array.from(
      new Set(data.sections.map((section) => departmentColorKey(section))),
    ).sort((a, b) => a.localeCompare(b));

    const useExpandedPalette = keys.length > DISTINCT_SOLID_DEPARTMENT_PALETTE.length;
    keys.forEach((key, index) => {
      map.set(
        key,
        useExpandedPalette ? paletteForDepartmentKey(key, true) : solidPaletteAt(index),
      );
    });

    return map;
  }, [data]);

  /** One swatch per department code (shared across all courses in that dept). */
  const departmentColorLegend = useMemo(() => {
    if (!data?.sections.length) return [];
    const byKey = new Map<
      string,
      { colorKey: string; label: string; swatch: DepartmentPalette }
    >();
    for (const s of data.sections) {
      const colorKey = departmentColorKey(s);
      if (byKey.has(colorKey)) continue;
      const swatch = departmentPaletteByKey.get(colorKey) ?? solidPaletteAt(0);
      const label = departmentLegendLabel(s);
      byKey.set(colorKey, { colorKey, label, swatch });
    }
    return Array.from(byKey.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
  }, [data, departmentPaletteByKey]);

  const crosslistGroupLegend = useMemo(() => {
    if (!data?.sections.length) return [];
    const membersByGroup = new Map<string, SectionDto[]>();
    for (const section of data.sections) {
      const groupId = String(section.crosslist_group_id ?? "").trim();
      if (!groupId) continue;
      const members = membersByGroup.get(groupId) ?? [];
      members.push(section);
      membersByGroup.set(groupId, members);
    }
    return Array.from(membersByGroup.entries())
      .filter(([, members]) => members.length >= 2)
      .map(([groupId, members]) => {
        const sortedMembers = [...members].sort((a, b) => a.id.localeCompare(b.id));
        const swatch =
          departmentPaletteByKey.get(departmentColorKey(sortedMembers[0])) ?? solidPaletteAt(0);
        return { groupId, members: sortedMembers, swatch };
      })
      .sort((a, b) => a.groupId.localeCompare(b.groupId));
  }, [data, departmentPaletteByKey]);

  const allDayEvents = useMemo(() => {
    if (!data) return [];
    const baseEvents = data.sections
      .map((s) => {
        const candidateTimeslotIds =
          assignmentsBySection[s.id]?.timeslot_ids ??
          solverTimeslotIdsBySection[s.id] ??
          (s.timeslot_id ? [s.timeslot_id] : []);
        const ts = candidateTimeslotIds
          .map((timeslotId) => timeslotById.get(timeslotId))
          .find((timeslot) => !!timeslot && timeslotMatchesDay(timeslot, selectedDay));
        const start = parseMinutes(ts?.start_time ?? "00:00");
        const end = parseMinutes(ts?.end_time ?? "00:00");
        const resolvedRoomId = assignmentsBySection[s.id]?.room_id ?? s.room_id ?? null;
        return { section: { ...s, room_id: resolvedRoomId }, timeslot: ts, start, end };
      })
      .filter((x) => x.timeslot && timeslotMatchesDay(x.timeslot, selectedDay))
      .sort((a, b) => {
        return a.start - b.start;
      });

    return assignCalendarEventLanes(
      mergeCrosslistCalendarEvents(baseEvents as RawCalendarEvent[]),
    );
  }, [assignmentsBySection, data, selectedDay, solverTimeslotIdsBySection, timeslotById]);

  const dayEvents = useMemo(
    () =>
      allDayEvents.filter((event) =>
        calendarEventMatchesFilters(event, sectionMatchesFilters),
      ),
    [allDayEvents, sectionMatchesFilters],
  );

  const getDayEvents = (day: Day) => {
    if (!data) return [];
    const baseEvents = data.sections
      .filter((section) => sectionMatchesFilters(section))
      .map((s) => {
        const candidateTimeslotIds =
          assignmentsBySection[s.id]?.timeslot_ids ??
          solverTimeslotIdsBySection[s.id] ??
          (s.timeslot_id ? [s.timeslot_id] : []);
        const ts = candidateTimeslotIds
          .map((timeslotId) => timeslotById.get(timeslotId))
          .find((timeslot) => !!timeslot && timeslotMatchesDay(timeslot, day));
        const start = parseMinutes(ts?.start_time ?? "00:00");
        const end = parseMinutes(ts?.end_time ?? "00:00");
        const resolvedRoomId = assignmentsBySection[s.id]?.room_id ?? s.room_id ?? null;
        return { section: { ...s, room_id: resolvedRoomId }, timeslot: ts, start, end };
      })
      .filter((x) => x.timeslot && timeslotMatchesDay(x.timeslot, day))
      .sort((a, b) => a.start - b.start);

    return assignCalendarEventLanes(
      mergeCrosslistCalendarEvents(baseEvents as RawCalendarEvent[]),
    );
  };

  const allEventsByRoom = useMemo(() => {
    const byRoom = new Map<string, typeof allDayEvents>();
    allDayEvents.forEach((event) => {
      const roomId = event.section.room_id;
      if (!roomId) return;
      if (!byRoom.has(roomId)) byRoom.set(roomId, []);
      byRoom.get(roomId)?.push(event);
    });
    return byRoom;
  }, [allDayEvents]);

  const roomRows = useMemo(() => {
    if (!data) return [];
    return data.rooms.map((room) => {
      const roomEvents = [...(allEventsByRoom.get(room.id) ?? [])].sort(
        (a, b) => a.start - b.start,
      );
      const laneEndTimes: number[] = [];
      const eventsWithLane = roomEvents.map((event) => {
        let lane = laneEndTimes.findIndex((laneEnd) => laneEnd <= event.start);
        if (lane === -1) {
          lane = laneEndTimes.length;
          laneEndTimes.push(event.end);
        } else {
          laneEndTimes[lane] = event.end;
        }
        return { ...event, lane };
      });
      const laneCount = eventsWithLane.reduce((max, event) => Math.max(max, event.lane + 1), 0);
      const needed =
        EVENT_TOP_PADDING_PX * 2 +
        laneCount * EVENT_HEIGHT_PX +
        Math.max(0, laneCount - 1) * EVENT_GAP_PX;
      const visibleEvents = eventsWithLane.filter((event) =>
        calendarEventMatchesFilters(event, sectionMatchesFilters),
      );
      const hiddenEvents = eventsWithLane.filter(
        (event) => !calendarEventMatchesFilters(event, sectionMatchesFilters),
      );
      return { room, visibleEvents, hiddenEvents, rowHeight: Math.max(100, needed) };
    });
  }, [allEventsByRoom, data, sectionMatchesFilters]);

  const linkedSectionIdsBySection = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!data) return map;
    const membersByGroup = new Map<string, string[]>();
    for (const section of data.sections) {
      const groupId = String(section.crosslist_group_id ?? "").trim();
      if (!groupId) continue;
      const members = membersByGroup.get(groupId) ?? [];
      members.push(section.id);
      membersByGroup.set(groupId, members);
    }
    for (const section of data.sections) {
      const groupId = String(section.crosslist_group_id ?? "").trim();
      const linked = groupId ? membersByGroup.get(groupId) ?? [section.id] : [section.id];
      map.set(section.id, linked);
    }
    return map;
  }, [data]);

  const calendarRoomRowsRef = useRef(roomRows);
  calendarRoomRowsRef.current = roomRows;

  const getRoomRowsForDay = (day: Day) => {
    if (!data) return [];
    const events = getDayEvents(day);
    const byRoom = new Map<string, typeof events>();
    events.forEach((event) => {
      const roomId = event.section.room_id;
      if (!roomId) return;
      if (!byRoom.has(roomId)) byRoom.set(roomId, []);
      byRoom.get(roomId)?.push(event);
    });

    return data.rooms.map((room) => {
      const roomEvents = [...(byRoom.get(room.id) ?? [])].sort((a, b) => a.start - b.start);
      const laneEndTimes: number[] = [];
      const roomEventsWithLane = roomEvents.map((event) => {
        let lane = laneEndTimes.findIndex((laneEnd) => laneEnd <= event.start);
        if (lane === -1) {
          lane = laneEndTimes.length;
          laneEndTimes.push(event.end);
        } else {
          laneEndTimes[lane] = event.end;
        }
        return { ...event, lane };
      });
      const laneCount = roomEventsWithLane.reduce((max, event) => Math.max(max, event.lane + 1), 0);
      const needed =
        EVENT_TOP_PADDING_PX * 2 +
        laneCount * EVENT_HEIGHT_PX +
        Math.max(0, laneCount - 1) * EVENT_GAP_PX;
      return { room, events: roomEventsWithLane, rowHeight: Math.max(100, needed) };
    });
  };

  const handleExportPdf = () => {
    window.print();
  };

  // Restore a snapshot's feedback (toast + conflict rings) directly when it was
  // captured with enriched history; otherwise fall back to the day re-scan so
  // older snapshots still re-surface conflicts (issue C7).
  const restoreSnapshotFeedback = useCallback((snapshot: UndoSnapshot) => {
    if (snapshot.dragFeedback !== undefined && snapshot.conflictSectionIds !== undefined) {
      setConflictSectionIds(new Set(snapshot.conflictSectionIds));
      setDragFeedback(snapshot.dragFeedback);
    } else {
      conflictRescanRef.current = true;
      setConflictRescanNonce((n) => n + 1);
    }
  }, []);

  const handleUndo = useCallback(() => {
    const stack = undoStackRef.current;
    const snapshot = stack[stack.length - 1];
    if (!snapshot) return;
    const currentSnapshot: UndoSnapshot = {
      key: stateKeyForUndo(assignmentsBySection, solverTimeslotIdsBySection),
      assignmentsBySection,
      solverTimeslotIdsBySection,
      backendSaveMessage,
      dragFeedback,
      conflictSectionIds: Array.from(conflictSectionIds),
    };
    const nextRedo = [...redoStackRef.current, currentSnapshot];
    const trimmedRedo = nextRedo.length > 25 ? nextRedo.slice(nextRedo.length - 25) : nextRedo;
    redoStackRef.current = trimmedRedo;
    setRedoStack(trimmedRedo);
    const nextStack = stack.slice(0, -1);
    // Update ref first so a second click can't read a stale stack.
    undoStackRef.current = nextStack;
    setUndoStack(nextStack);
    setAssignmentsBySection(snapshot.assignmentsBySection);
    setSolverTimeslotIdsBySection(snapshot.solverTimeslotIdsBySection);
    restoreSnapshotFeedback(snapshot);
    setBackendSaveMessage(snapshot.backendSaveMessage);
  }, [
    assignmentsBySection,
    backendSaveMessage,
    conflictSectionIds,
    dragFeedback,
    restoreSnapshotFeedback,
    solverTimeslotIdsBySection,
    stateKeyForUndo,
  ]);

  const handleRedo = useCallback(() => {
    const stack = redoStackRef.current;
    const snapshot = stack[stack.length - 1];
    if (!snapshot) return;
    const currentSnapshot: UndoSnapshot = {
      key: stateKeyForUndo(assignmentsBySection, solverTimeslotIdsBySection),
      assignmentsBySection,
      solverTimeslotIdsBySection,
      backendSaveMessage,
      dragFeedback,
      conflictSectionIds: Array.from(conflictSectionIds),
    };
    const nextUndo = [...undoStackRef.current, currentSnapshot];
    const trimmedUndo = nextUndo.length > 25 ? nextUndo.slice(nextUndo.length - 25) : nextUndo;
    undoStackRef.current = trimmedUndo;
    setUndoStack(trimmedUndo);

    const nextRedo = stack.slice(0, -1);
    redoStackRef.current = nextRedo;
    setRedoStack(nextRedo);

    setAssignmentsBySection(snapshot.assignmentsBySection);
    setSolverTimeslotIdsBySection(snapshot.solverTimeslotIdsBySection);
    restoreSnapshotFeedback(snapshot);
    setBackendSaveMessage(snapshot.backendSaveMessage);
  }, [
    assignmentsBySection,
    backendSaveMessage,
    conflictSectionIds,
    dragFeedback,
    restoreSnapshotFeedback,
    solverTimeslotIdsBySection,
    stateKeyForUndo,
  ]);

  const updateLastRunStorage = useCallback(
    (nextInput: SchedulingInput, assignments: AssignmentMap, locks?: string[]) => {
      const lockList = locks ?? lockedSectionIds;
      if (typeof window === "undefined") return;
      localStorage.setItem(
        LAST_SOLVER_RUN_STORAGE_KEY,
        JSON.stringify({
          input: nextInput,
          solution: {
            status: "ok",
            assignments: Object.entries(assignments).map(([section_id, value]) => ({
              section_id,
              timeslot_ids: value.timeslot_ids,
              room_id: value.room_id,
              meeting_pattern_id: value.meeting_pattern_id,
            })),
            total_score: 0,
            penalty_breakdown: {},
            explanations: [],
          },
          lockedSectionIds: lockList,
          createdAt: new Date().toISOString(),
        }),
      );
    },
    [lockedSectionIds],
  );

  const hasValidUnsavedEdit = useMemo(() => {
    const normalize = (map: AssignmentMap) =>
      Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sectionId, v]) => ({
          sectionId,
          room_id: v.room_id || "",
          meeting_pattern_id: v.meeting_pattern_id || "",
          timeslot_ids: [...(v.timeslot_ids ?? [])].sort(),
        }));
    const changed =
      JSON.stringify(normalize(assignmentsBySection)) !==
      JSON.stringify(normalize(baselineAssignments));
    // Warning placements (room overlap, instructor conflict) are saveable too —
    // only hard blocks (which never apply the move) are excluded.
    const saveableStatus =
      dragFeedback.status === "valid" || dragFeedback.status === "warning";
    return changed && saveableStatus;
  }, [assignmentsBySection, baselineAssignments, dragFeedback.status]);

  // React to solver runs published by other live users. On first poll we adopt
  // the current revision as a baseline so we only react to runs that happen
  // while this user is present. Newer revisions auto-apply when the page is
  // clean, or surface an "apply" banner if that would discard local edits or a
  // schedule the user pulled from history.
  useEffect(() => {
    const rev = sharedScheduleMeta.revision;
    if (!sharedInitializedRef.current) {
      sharedInitializedRef.current = true;
      appliedSharedRevisionRef.current = rev;
      return;
    }
    if (rev <= 0 || rev <= appliedSharedRevisionRef.current) return;
    // Our own in-flight run will set the applied revision on success.
    if (solverRunStatus === "loading") return;
    const clean = !hasValidUnsavedEdit && !historyViewActiveRef.current;
    if (clean) {
      void applySharedSnapshot();
    } else {
      setIncomingShared({ revision: rev, ranBy: sharedScheduleMeta.ranBy });
    }
  }, [
    sharedScheduleMeta.revision,
    sharedScheduleMeta.ranBy,
    solverRunStatus,
    hasValidUnsavedEdit,
    applySharedSnapshot,
  ]);

  // Per-day (start,end) times a section currently meets, keyed by weekday. Used for
  // the staggered indicator and the pre-lock summary.
  const sectionDayTimes = useCallback(
    (sectionId: string): { day: Day; timeLabel: string }[] => {
      const assignment = assignmentsBySection[sectionId];
      const section = sectionById.get(sectionId);
      const timeslotIds =
        assignment?.timeslot_ids ?? (section?.timeslot_id ? [section.timeslot_id] : []);
      const byDay = new Map<Day, string>();
      for (const id of timeslotIds) {
        const slot = timeslotById.get(id);
        if (!slot) continue;
        for (const day of DAYS) {
          if (timeslotMatchesDay(slot, day)) {
            byDay.set(day, `${formatTimeAmPm(slot.start_time)}-${formatTimeAmPm(slot.end_time)}`);
          }
        }
      }
      return DAYS.filter((day) => byDay.has(day)).map((day) => ({
        day,
        timeLabel: byDay.get(day) as string,
      }));
    },
    [assignmentsBySection, sectionById, timeslotById],
  );

  // "Staggered" = meets on more than one day, but not all days share the same time.
  const sectionIsStaggered = useCallback(
    (sectionId: string): boolean => {
      const dayTimes = sectionDayTimes(sectionId);
      if (dayTimes.length <= 1) return false;
      return new Set(dayTimes.map((entry) => entry.timeLabel)).size > 1;
    },
    [sectionDayTimes],
  );

  const isPlacementLocked = useCallback(
    (sectionId: string) => {
      if (!data) return false;
      return crosslistPeerSectionIds(sectionId, data.sections).some((id) =>
        lockedSectionIds.includes(id),
      );
    },
    [data, lockedSectionIds],
  );

  const canLockSectionPlacement = useCallback(
    (sectionId: string) => {
      if (!data) return false;
      const section = data.sections.find((s) => s.id === sectionId);
      if (!section) return false;
      const a = normalizeAssignmentMapEntry(section, assignmentsBySection);
      return a.timeslot_ids.length > 0 && !!a.room_id;
    },
    [assignmentsBySection, data],
  );

  const togglePlacementLockForSection = useCallback(
    (sectionId: string) => {
      if (!data) return;
      if (!canLockSectionPlacement(sectionId)) {
        setDragFeedback({
          status: "invalid",
          message: "Assign a room and times before locking this section.",
        });
        setCalendarContextMenu(null);
        return;
      }
      const peers = crosslistPeerSectionIds(sectionId, data.sections);
      const willLock = !peers.some((p) => lockedSectionIds.includes(p));
      setLockedSectionIds((prev) => {
        const next = new Set(prev);
        const anyLocked = peers.some((p) => next.has(p));
        if (anyLocked) peers.forEach((p) => next.delete(p));
        else peers.forEach((p) => next.add(p));
        return Array.from(next);
      });
      // Locking must immediately invalidate any in-progress drag so a pointer
      // sequence started before the lock cannot commit a move.
      if (willLock && calendarDrag && peers.includes(calendarDrag.sectionId)) {
        setCalendarDrag(null);
      }
      setCalendarContextMenu(null);
    },
    [calendarDrag, canLockSectionPlacement, data, lockedSectionIds],
  );

  // Entry point for the on-card lock button. Unlocking is immediate; locking a
  // staggered section first surfaces a confirmation so the user reviews its
  // per-day times. Locking pins every day of the meeting pattern (peers included).
  const requestToggleLockFromCalendar = useCallback(
    (sectionId: string) => {
      const willLock = !isPlacementLocked(sectionId);
      if (willLock && !canLockSectionPlacement(sectionId)) {
        setDragFeedback({
          status: "invalid",
          message: "Assign a room and times before locking this section.",
        });
        return;
      }
      if (willLock && sectionIsStaggered(sectionId)) {
        const section = sectionById.get(sectionId);
        const courseLabel =
          [section?.department, String(section?.course_id ?? sectionId)]
            .filter(Boolean)
            .join(" ")
            .trim() || sectionId;
        setStaggeredLockConfirm({
          sectionId,
          courseLabel,
          dayTimes: sectionDayTimes(sectionId),
        });
        return;
      }
      togglePlacementLockForSection(sectionId);
    },
    [
      canLockSectionPlacement,
      isPlacementLocked,
      sectionById,
      sectionDayTimes,
      sectionIsStaggered,
      togglePlacementLockForSection,
    ],
  );

  const confirmStaggeredLock = useCallback(() => {
    if (!staggeredLockConfirm) return;
    togglePlacementLockForSection(staggeredLockConfirm.sectionId);
    setStaggeredLockConfirm(null);
  }, [staggeredLockConfirm, togglePlacementLockForSection]);

  const lockAllPlacementChanges = useCallback(() => {
    if (!data) return;
    const norm = (s: SectionDto, m: AssignmentMap) => {
      const v = normalizeAssignmentMapEntry(s, m);
      return JSON.stringify({
        room_id: v.room_id,
        meeting_pattern_id: v.meeting_pattern_id,
        timeslot_ids: [...v.timeslot_ids].sort(),
      });
    };
    const next = new Set(lockedSectionIds);
    let groupsLocked = 0;
    for (const s of data.sections) {
      if (norm(s, assignmentsBySection) === norm(s, baselineAssignments)) continue;
      const cur = normalizeAssignmentMapEntry(s, assignmentsBySection);
      if (!cur.timeslot_ids.length || !cur.room_id) continue;
      const peers = crosslistPeerSectionIds(s.id, data.sections);
      const before = next.size;
      peers.forEach((p) => next.add(p));
      if (next.size > before) groupsLocked += 1;
    }
    setLockedSectionIds(Array.from(next));
    if (calendarDrag && next.has(calendarDrag.sectionId)) {
      setCalendarDrag(null);
    }
    setDragFeedback({
      status: groupsLocked > 0 ? "valid" : "neutral",
      message:
        groupsLocked > 0
          ? `Locked ${groupsLocked} section group(s) that differ from the baseline. Cross-listed peers lock together.`
          : "No changed sections with both a room and times to lock.",
    });
  }, [assignmentsBySection, baselineAssignments, calendarDrag, data, lockedSectionIds]);

  const unlockAllPlacementLocks = useCallback(() => {
    setLockedSectionIds([]);
    setDragFeedback({
      status: "valid",
      message: "Cleared all placement locks for this calendar session.",
    });
  }, []);

  const hasAnyPlacementLock = lockedSectionIds.length > 0;

  const tableSectionsFiltered = useMemo(() => {
    if (!data) return [];
    return [...data.sections]
      .filter((s) => sectionMatchesFilters(s))
      .sort((a, b) => {
        const da = (a.department ?? "").localeCompare(b.department ?? "", undefined, {
          sensitivity: "base",
        });
        if (da !== 0) return da;
        const ca = String(a.course_id).localeCompare(String(b.course_id), undefined, {
          numeric: true,
        });
        if (ca !== 0) return ca;
        return (a.section_code ?? "").localeCompare(b.section_code ?? "", undefined, {
          sensitivity: "base",
        });
      });
  }, [data, sectionMatchesFilters]);

  const drawerSectionsSearched = useMemo(() => {
    const q = drawerSearch.trim().toLowerCase();
    if (!q) return tableSectionsFiltered;
    return tableSectionsFiltered.filter((section) => {
      const assignment = normalizeAssignmentMapEntry(section, assignmentsBySection);
      const haystack = [
        section.id,
        section.department,
        section.course_id,
        section.section_code,
        section.instructor_id,
        assignment.room_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [drawerSearch, tableSectionsFiltered, assignmentsBySection]);

  useEffect(() => {
    // Conflict highlights are computed for a specific day's layout; drop them when
    // the visible day changes so stale flags don't linger.
    setConflictSectionIds(new Set());
    setPatternApplyPrompt(null);
  }, [selectedDay]);

  useEffect(() => {
    // Runs only when undo/redo requested a re-scan (guarded by the ref). Reads the
    // freshly recomputed `allDayEvents` and re-surfaces any conflicts + highlights.
    if (!conflictRescanRef.current) return;
    conflictRescanRef.current = false;
    const { sectionIds, hasRoomConflict, hasInstructorConflict } =
      computeCalendarDayConflicts(allDayEvents);
    if (sectionIds.size === 0) {
      setConflictSectionIds(new Set());
      setDragFeedback({ status: "neutral", message: null });
      return;
    }
    setConflictSectionIds(sectionIds);
    const kinds: string[] = [];
    if (hasRoomConflict) kinds.push("room double-booking");
    if (hasInstructorConflict) kinds.push("instructor double-booking");
    setDragFeedback({
      status: "invalid",
      message: `Warning: ${sectionIds.size} section${sectionIds.size === 1 ? "" : "s"} on ${selectedDay} still ${sectionIds.size === 1 ? "has" : "have"} a ${kinds.join(" and ")} at overlapping times. Highlighted sections show the conflict.`,
    });
    // selectedDay intentionally omitted — this reacts to the undo/redo nonce and the
    // recomputed events, not day switches (which clear highlights above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflictRescanNonce, allDayEvents]);

  useEffect(() => {
    if (scheduleDrawerOpen) {
      setDrawerRender(true);
      // Two rAFs: mount off-screen, let the browser paint that state, then flip
      // the transform on the *next* frame so the slide-in transition actually runs.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setDrawerEntered(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    // Closing: play the slide-out, then unmount. `transitionend` handles the
    // unmount; this timeout is a safety net if the event doesn't fire.
    setDrawerEntered(false);
    const timeout = setTimeout(() => setDrawerRender(false), 400);
    return () => clearTimeout(timeout);
  }, [scheduleDrawerOpen]);

  useEffect(() => {
    if (!solverInput) return;
    updateLastRunStorage(solverInput, assignmentsBySection, lockedSectionIds);
    // Intentionally only when locks change — assignment changes persist via other flows.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignments read from latest render
  }, [lockedSectionIds, solverInput, updateLastRunStorage]);

  useEffect(() => {
    if (!calendarContextMenu) return;
    const close = () => setCalendarContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const t = window.setTimeout(() => {
      window.addEventListener("click", close, { capture: true });
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", close, { capture: true });
    };
  }, [calendarContextMenu]);

  const runSolverNow = useCallback(async () => {
    if (solverBusyRemote) {
      setSolverRunError(
        solverLock.startedBy
          ? `The solver is currently running (started by ${solverLock.startedBy}). Please wait for it to finish.`
          : "The solver is currently running. Please wait for it to finish.",
      );
      return;
    }
    if (hasValidUnsavedEdit && !autoSaveEnabled) {
      if (typeof window !== "undefined") {
        const choice = window.confirm(
          "You have unsaved calendar edits. Save them to the backend before running the solver?\n\nOK = save first, Cancel = run without saving.",
        );
        if (choice) {
          await updateBackendRef.current(true);
        }
      }
    }
    setSolverRunError(null);
    setSolverRunStatus("loading");
    beginSolverProgress();
    try {
      let input: SchedulingInput | null = solverInput;
      if (!input) {
        const res = await fetch("/api/data", { method: "GET" });
        const json = (await res.json()) as
          | { status: "ok"; data: SchedulingInput }
          | { status: "error"; errors: { message?: string }[] };
        if (!res.ok || json.status !== "ok") {
          const msg =
            json.status === "error"
              ? json.errors.map((e) => e.message).filter(Boolean).join(" | ")
              : "Failed to load scheduling data.";
          throw new Error(msg);
        }
        input = json.data;
      }
      const sectionsForLocks = data?.sections ?? [];
      const mergedLocks = mergePlacementLocks(
        input.locked_assignments ?? [],
        lockedSectionIds,
        assignmentsBySection,
        sectionsForLocks,
      );
      const nextInput: SchedulingInput = {
        ...input,
        locked_assignments: mergedLocks,
      };
      // Fail fast on spreadsheet row-level data issues before hitting the solver,
      // matching the editor's Run Solver flow (issue C11). Located issues route to
      // /solver-errors so the user sees the same row-anchored guidance.
      const validation = await validateSchedulingInput(nextInput);
      if (!validation.ok) {
        const summary =
          validation.issueCount === 1
            ? "Found 1 data issue before running the solver."
            : `Found ${validation.issueCount} data issues before running the solver.`;
        storeSolverErrorSnapshot(nextInput, validation.issues, {
          validation_issue_count: validation.issueCount,
          error_codes: Array.from(new Set(validation.issues.map((issue) => issue.code))),
        });
        failSolverProgress();
        setSolverRunError(summary);
        setSolverRunStatus("idle");
        router.push("/solver-errors");
        return;
      }
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextInput),
      });
      const raw = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw new Error(`Schedule API returned non-JSON (status ${response.status}).`);
      }
      const result = parsed as ScheduleSolution & {
        status?: string;
        errors?: { message?: string }[];
        diagnostics?: unknown;
        shared_revision?: number;
      };
      if (response.status === 409) {
        const busyMsg =
          Array.isArray(result.errors) && result.errors[0]?.message
            ? String(result.errors[0].message)
            : "The solver is currently running. Please wait for it to finish.";
        failSolverProgress();
        setSolverRunError(busyMsg);
        setSolverRunStatus("idle");
        return;
      }
      if (!response.ok || result.status === "error") {
        const errors = (result.errors ?? []) as ValidationError[];
        storeSolverErrorSnapshot(nextInput, errors, result.diagnostics);
        failSolverProgress();
        router.push("/solver-errors");
        return;
      }
      const assignments = result.assignments ?? [];
      const nextAssignments: AssignmentMap = Object.fromEntries(
        assignments.map((assignment) => [
          assignment.section_id,
          {
            timeslot_ids: assignment.timeslot_ids,
            room_id: assignment.room_id,
            meeting_pattern_id: assignment.meeting_pattern_id,
          },
        ]),
      );
      const allTimeslotIdsBySection = Object.fromEntries(
        assignments.map((assignment) => [assignment.section_id, assignment.timeslot_ids]),
      );
      setSolverInput(nextInput);
      setAssignmentsBySection(nextAssignments);
      setBaselineAssignments(nextAssignments);
      setSolverTimeslotIdsBySection(allTimeslotIdsBySection);
      updateLastRunStorage(nextInput, nextAssignments, lockedSectionIds);
      // This run is the newest shared schedule; adopt its revision so the sync
      // effect doesn't treat our own result as an incoming change, and mark the
      // fresh iteration as not-yet-saved to history.
      if (typeof result.shared_revision === "number") {
        appliedSharedRevisionRef.current = result.shared_revision;
      }
      historyViewActiveRef.current = false;
      setLastHistorySavedSignature(null);
      setIncomingShared(null);
      if (data) {
        setData({
          ...data,
          sections: data.sections.map((section) => {
            const assignment = nextAssignments[section.id];
            return {
              ...section,
              room_id: assignment?.room_id ?? section.room_id ?? null,
              timeslot_id: assignment?.timeslot_ids?.[0] ?? section.timeslot_id ?? null,
              previous_meeting_pattern:
                assignment?.meeting_pattern_id ?? section.previous_meeting_pattern ?? null,
            };
          }),
        });
      }
      setDragFeedback({
        status: "valid",
        message: "Solver finished. Schedule updated on this page.",
      });
      succeedSolverProgress();
    } catch (e) {
      failSolverProgress();
      const raw = e instanceof Error ? e.message : "Failed to run solver.";
      if (solverInput) {
        const errors = storeSolverNetworkError(solverInput, raw);
        setSolverRunError(errors.map((err) => err.message).join(" "));
      } else {
        setSolverRunError(normalizeNetworkError(raw, "solver"));
      }
    } finally {
      setSolverRunStatus("idle");
    }
  }, [
    assignmentsBySection,
    autoSaveEnabled,
    beginSolverProgress,
    data,
    failSolverProgress,
    hasValidUnsavedEdit,
    lockedSectionIds,
    router,
    solverBusyRemote,
    solverLock.startedBy,
    succeedSolverProgress,
    solverInput,
    updateLastRunStorage,
  ]);

  // Whether the current calendar is a schedule iteration not yet saved to
  // History (either a fresh solver result or manual edits since the last save).
  const hasUnsavedIteration = useMemo(() => {
    if (Object.keys(assignmentsBySection).length === 0) return false;
    return lastHistorySavedSignature !== assignmentsSignature(assignmentsBySection);
  }, [assignmentsBySection, lastHistorySavedSignature]);

  // Entry point for the Run Solver button. Gates on the remote lock and, when
  // the current schedule hasn't been saved to History, warns first (with the
  // option to save) so a re-run doesn't quietly discard it — for everyone.
  const handleRunSolverFromCalendar = useCallback(() => {
    if (solverBusyRemote) {
      setSolverRunError(
        solverLock.startedBy
          ? `The solver is currently running (started by ${solverLock.startedBy}). Please wait for it to finish.`
          : "The solver is currently running. Please wait for it to finish.",
      );
      return;
    }
    if (hasUnsavedIteration) {
      setRunSolverPrompt({ hasUnsavedIteration: true });
      return;
    }
    void runSolverNow();
  }, [solverBusyRemote, solverLock.startedBy, hasUnsavedIteration, runSolverNow]);

  const dayTimeslotBoundaries = useMemo(() => {
    if (!data) return [];
    const boundaries = new Set<number>();
    data.timeslots
      .filter((slot) => timeslotMatchesDay(slot, selectedDay))
      .forEach((slot) => {
        boundaries.add(parseMinutes(slot.start_time));
        boundaries.add(parseMinutes(slot.end_time));
      });
    return Array.from(boundaries)
      .filter((m) => m >= axisStart && m <= axisEnd)
      .sort((a, b) => a - b);
  }, [data, selectedDay, axisStart, axisEnd]);

  /** Timeslots on the selected day that match the dragged section's assigned meeting pattern length. */
  const dragPossibleTimeslots = useMemo(() => {
    if (!data || !calendarDrag?.sectionId) return [];
    const sectionId = calendarDrag.sectionId;
    const allowedDurations = getAllowedSlotDurationsForDrag(
      sectionId,
      assignmentsBySection,
      data,
      solverInput ?? null,
      selectedDay,
      timeslotById,
      allDayEvents,
    );
    return data.timeslots
      .filter((slot) => timeslotMatchesDay(slot, selectedDay))
      .map((slot) => ({
        ...slot,
        start: parseMinutes(slot.start_time),
        end: parseMinutes(slot.end_time),
      }))
      .filter((slot) =>
        slotDurationMatchesAllowedLengths(Math.max(0, slot.end - slot.start), allowedDurations),
      );
  }, [
    allDayEvents,
    assignmentsBySection,
    calendarDrag?.sectionId,
    data,
    selectedDay,
    solverInput,
    timeslotById,
  ]);

  const dragPossibleTimeslotBoundaries = useMemo(() => {
    if (!dragPossibleTimeslots.length) return [];
    const boundaries = new Set<number>();
    dragPossibleTimeslots.forEach((slot) => {
      boundaries.add(slot.start);
      boundaries.add(slot.end);
    });
    return Array.from(boundaries)
      .filter((m) => m >= axisStart && m <= axisEnd)
      .sort((a, b) => a - b);
  }, [dragPossibleTimeslots, axisStart, axisEnd]);

  const dragBlockedTimeslotInfo = useMemo(() => {
    const blockedSlotIds = new Set<string>();
    const blockedReasonBySlotId = new Map<string, string>();
    if (!calendarDrag?.sectionId || !dragPossibleTimeslots.length || !solverInput) {
      return { blockedSlotIds, blockedReasonBySlotId };
    }
    const linkedSectionIds = linkedSectionIdsBySection.get(calendarDrag.sectionId) ?? [
      calendarDrag.sectionId,
    ];
    for (const roomRow of roomRows) {
      for (const slot of dragPossibleTimeslots) {
        for (const linkedSectionId of linkedSectionIds) {
          const blockedMessage = findBlockedPlacementMessage(linkedSectionId, roomRow.room.id, slot);
          if (!blockedMessage) continue;
          const key = `${roomRow.room.id}::${slot.id}`;
          blockedSlotIds.add(key);
          blockedReasonBySlotId.set(key, blockedMessage);
          break;
        }
      }
    }
    return { blockedSlotIds, blockedReasonBySlotId };
  }, [
    calendarDrag?.sectionId,
    dragPossibleTimeslots,
    findBlockedPlacementMessage,
    linkedSectionIdsBySection,
    roomRows,
    solverInput,
  ]);

  // A section is "multi-day" if it occupies more than one timeslot, if any of its
  // timeslots spans multiple days, or if its meeting pattern spans multiple days.
  // Dragging one day of such a section only moves that day (issue C3).
  const sectionHasMultiDayPattern = useCallback(
    (sectionId: string) => {
      const assignment = assignmentsBySection[sectionId];
      const timeslotIds = assignment?.timeslot_ids ?? [];
      if (timeslotIds.length > 1) return true;
      for (const id of timeslotIds) {
        const slot = timeslotById.get(id);
        if (slot && DAYS.filter((day) => timeslotMatchesDay(slot, day)).length > 1) {
          return true;
        }
      }
      const patternId = assignment?.meeting_pattern_id?.trim();
      if (patternId && solverInput) {
        const pattern = (solverInput.meeting_patterns ?? []).find((p) => p.id === patternId);
        if (pattern && DAYS.filter((day) => meetingPatternIncludesDay(pattern, day)).length > 1) {
          return true;
        }
      }
      return false;
    },
    [assignmentsBySection, solverInput, timeslotById],
  );

  const commitCalendarPlacement = useCallback(
    (sectionId: string, targetRoomId: string, selectedSlot: TimeslotWithMinutes) => {
      if (!data) return;
      const dragged = findCalendarEventBySectionId(allDayEvents, sectionId);
      if (!dragged || !dragged.timeslot) return;
      const linkedSectionIds = linkedSectionIdsBySection.get(sectionId) ?? [sectionId];

      // Single source of truth shared with the click-to-place path.
      const evaluation = evaluatePlacementShared({
        sectionId,
        targetRoomId,
        slot: selectedSlot,
        selectedDay,
        data,
        assignmentsBySection,
        allDayEvents,
        linkedSectionIds,
        instructorById,
        findBlockedPlacementMessage,
        formatTime: formatTimeAmPm,
      });
      // Blocked time and capacity are hard blocks — the move is not applied.
      if (evaluation.severity === "block") {
        setDragFeedback({ status: "invalid", message: evaluation.message });
        return;
      }

      const currentAssignment = assignmentsBySection[sectionId];
      const currentTimeslotIds =
        currentAssignment?.timeslot_ids ??
        (dragged.section.timeslot_id ? [dragged.section.timeslot_id] : []);

      const nextTimeslotIds = currentTimeslotIds.map((id) => {
        const slot = timeslotById.get(id);
        if (slot && timeslotMatchesDay(slot, selectedDay)) {
          return selectedSlot.id;
        }
        return id;
      });
      const uniqueNextTimeslotIds = Array.from(new Set(nextTimeslotIds));
      const alreadyPlaced = linkedSectionIds.every((linkedSectionId) => {
        const linkedEvent = findCalendarEventBySectionId(allDayEvents, linkedSectionId);
        const linkedAssignment = assignmentsBySection[linkedSectionId];
        const linkedCurrentRoomId = linkedAssignment?.room_id ?? linkedEvent?.section.room_id ?? "";
        const linkedCurrentTimeslotIds =
          linkedAssignment?.timeslot_ids ??
          (linkedEvent?.section.timeslot_id ? [linkedEvent.section.timeslot_id] : []);
        return (
          targetRoomId === linkedCurrentRoomId &&
          JSON.stringify([...uniqueNextTimeslotIds].sort()) ===
            JSON.stringify([...(linkedAssignment?.timeslot_ids ?? linkedCurrentTimeslotIds)].sort())
        );
      });
      if (!alreadyPlaced) {
        // Snapshot the pre-placement state (assignments + the toast/rings showing
        // right now) so undo restores the exact prior view without a re-scan.
        pushUndoSnapshot({
          assignmentsBySection,
          solverTimeslotIdsBySection,
          backendSaveMessage,
          dragFeedback,
          conflictSectionIds,
        });
      }
      const nextAssignments: AssignmentMap = {
        ...assignmentsBySection,
      };
      for (const linkedSectionId of linkedSectionIds) {
        const linkedAssignment = assignmentsBySection[linkedSectionId];
        nextAssignments[linkedSectionId] = {
          timeslot_ids: uniqueNextTimeslotIds,
          room_id: targetRoomId,
          meeting_pattern_id: linkedAssignment?.meeting_pattern_id ?? "",
        };
      }
      setAssignmentsBySection(nextAssignments);
      setSolverTimeslotIdsBySection((prev) => ({
        ...prev,
        ...Object.fromEntries(
          linkedSectionIds.map((linkedSectionId) => [linkedSectionId, uniqueNextTimeslotIds]),
        ),
      }));

      // Dragging a multi-day pattern only moves the selected day's slot. Offer to
      // extend the new time to the pattern's other days (issue C3, Option B).
      const multiDay = sectionHasMultiDayPattern(sectionId);
      const otherPatternDaySet = new Set<Day>();
      for (const id of currentTimeslotIds) {
        const slot = timeslotById.get(id);
        if (!slot) continue;
        for (const day of DAYS) {
          if (day !== selectedDay && timeslotMatchesDay(slot, day)) otherPatternDaySet.add(day);
        }
      }
      const otherPatternDays = DAYS.filter((day) => otherPatternDaySet.has(day));
      const canOfferPatternApply = multiDay && otherPatternDays.length > 0;
      if (canOfferPatternApply) {
        setPatternApplyPrompt({
          sectionId,
          roomId: targetRoomId,
          anchorSlotId: selectedSlot.id,
          anchorDay: selectedDay,
          otherDays: otherPatternDays,
        });
      } else {
        setPatternApplyPrompt(null);
      }
      const multiDayNotice = canOfferPatternApply
        ? `Only ${selectedDay} was updated. Use "Apply to all pattern days" to extend this time to its other days (${otherPatternDays.join(", ")}).`
        : `Only ${selectedDay} was updated. This section uses a multi-day pattern — its other days are unchanged. Adjust them from the schedule table or re-place per day.`;

      // Warnings (room overlap, instructor double-booking) keep the applied move
      // but flag the involved sections for review.
      if (evaluation.severity === "warn") {
        setConflictSectionIds(new Set(evaluation.conflictSectionIds));
        setDragFeedback({
          status: "warning",
          message: canOfferPatternApply ? `${evaluation.message} ${multiDayNotice}` : evaluation.message,
        });
      } else {
        setConflictSectionIds(new Set());
        if (canOfferPatternApply) {
          setDragFeedback({ status: "warning", message: multiDayNotice });
        } else {
          setDragFeedback({ status: "valid", message: evaluation.message });
        }
      }
    },
    [
      assignmentsBySection,
      allDayEvents,
      backendSaveMessage,
      conflictSectionIds,
      dragFeedback,
      data,
      instructorById,
      linkedSectionIdsBySection,
      findBlockedPlacementMessage,
      pushUndoSnapshot,
      sectionHasMultiDayPattern,
      selectedDay,
      solverTimeslotIdsBySection,
      timeslotById,
    ],
  );

  // Finds a timeslot on `day` whose start/end minutes match the anchor time. Prefers
  // a single-day slot so extending a pattern day-by-day doesn't re-introduce a
  // multi-day slot into the section's assignment.
  const findSlotOnDayAtTime = useCallback(
    (day: Day, startTime: string, endTime: string): TimeslotDto | null => {
      if (!data) return null;
      const startMin = parseMinutes(startTime);
      const endMin = parseMinutes(endTime);
      const candidates = data.timeslots.filter(
        (slot) =>
          timeslotMatchesDay(slot, day) &&
          parseMinutes(slot.start_time) === startMin &&
          parseMinutes(slot.end_time) === endMin,
      );
      if (!candidates.length) return null;
      const singleDay = candidates.find(
        (slot) => DAYS.filter((d) => timeslotMatchesDay(slot, d)).length === 1,
      );
      return singleDay ?? candidates[0];
    },
    [data],
  );

  // Day-agnostic placement check used to preview extending a time onto another
  // pattern day. Mirrors evaluatePlacement's rules (blocked time = hard block,
  // room/instructor overlap = warning) but scans assignments so it works for a day
  // the user isn't currently viewing.
  const evaluatePatternDayPlacement = useCallback(
    (
      sectionId: string,
      targetRoomId: string,
      candidateSlot: TimeslotDto,
      day: Day,
      baseAssignments: AssignmentMap,
    ): { severity: "ok" | "warn" | "block"; message: string } => {
      if (!data) return { severity: "block", message: "Calendar data unavailable." };
      const linkedIds = crosslistPeerSectionIds(sectionId, data.sections);
      const linkedSet = new Set(linkedIds);
      const slotWM: TimeslotWithMinutes = {
        ...candidateSlot,
        start: parseMinutes(candidateSlot.start_time),
        end: parseMinutes(candidateSlot.end_time),
      };
      const timeStr = `${formatTimeAmPm(candidateSlot.start_time)}-${formatTimeAmPm(candidateSlot.end_time)}`;

      for (const linkedId of linkedIds) {
        const blocked = findBlockedPlacementMessage(linkedId, targetRoomId, slotWM, day);
        if (blocked) return { severity: "block", message: blocked };
      }

      const instructorIds = new Set<string>();
      for (const id of linkedIds) {
        const instr = sectionById.get(id)?.instructor_id;
        if (instr) instructorIds.add(instr);
      }

      const roomConflictLabels: string[] = [];
      let instructorConflict: { name: string; label: string } | null = null;
      for (const [otherId, assignment] of Object.entries(baseAssignments)) {
        if (linkedSet.has(otherId)) continue;
        const otherSlotIds = assignment?.timeslot_ids ?? [];
        const overlaps = otherSlotIds.some((sid) => {
          const s = timeslotById.get(sid);
          if (!s || !timeslotMatchesDay(s, day)) return false;
          return minutesOverlap(
            slotWM.start,
            slotWM.end,
            parseMinutes(s.start_time),
            parseMinutes(s.end_time),
          );
        });
        if (!overlaps) continue;
        const otherSection = sectionById.get(otherId);
        const otherLabel =
          [otherSection?.department, String(otherSection?.course_id ?? otherId)]
            .filter(Boolean)
            .join(" ")
            .trim() || otherId;
        const otherRoom = assignment?.room_id ?? otherSection?.room_id ?? "";
        if (otherRoom === targetRoomId) roomConflictLabels.push(otherLabel);
        const otherInstr = otherSection?.instructor_id;
        if (otherInstr && instructorIds.has(otherInstr) && !instructorConflict) {
          instructorConflict = {
            name: instructorById.get(otherInstr)?.name ?? otherInstr,
            label: otherLabel,
          };
        }
      }

      if (instructorConflict) {
        return {
          severity: "warn",
          message: `${instructorConflict.name} already teaches ${instructorConflict.label} at ${day} ${timeStr}.`,
        };
      }
      if (roomConflictLabels.length) {
        return {
          severity: "warn",
          message: `Room ${targetRoomId} is shared with ${roomConflictLabels.slice(0, 3).join(", ")} at ${day} ${timeStr}.`,
        };
      }
      return { severity: "ok", message: `Available in room ${targetRoomId} at ${day} ${timeStr}.` };
    },
    [data, findBlockedPlacementMessage, instructorById, sectionById, timeslotById],
  );

  const buildPatternApplyRows = useCallback(
    (
      sectionId: string,
      targetRoomId: string,
      anchorSlot: TimeslotDto,
      otherDays: Day[],
      baseAssignments: AssignmentMap,
    ): PatternDayApplyRow[] => {
      const timeLabel = `${formatTimeAmPm(anchorSlot.start_time)}-${formatTimeAmPm(anchorSlot.end_time)}`;
      return otherDays.map((day) => {
        const slot = findSlotOnDayAtTime(day, anchorSlot.start_time, anchorSlot.end_time);
        if (!slot) {
          return {
            day,
            targetSlotId: null,
            timeLabel,
            severity: "none" as const,
            message: `No timeslot exists at ${timeLabel} on ${day}. Stagger this day or pick a different time.`,
            selected: false,
          };
        }
        const result = evaluatePatternDayPlacement(
          sectionId,
          targetRoomId,
          slot,
          day,
          baseAssignments,
        );
        return {
          day,
          targetSlotId: slot.id,
          timeLabel,
          severity: result.severity,
          message: result.message,
          // Pre-check clean days; leave conflicting/impossible days for the user.
          selected: result.severity === "ok",
        };
      });
    },
    [evaluatePatternDayPlacement, findSlotOnDayAtTime],
  );

  const openPatternApplyModal = useCallback(() => {
    if (!patternApplyPrompt) return;
    const anchorSlot = timeslotById.get(patternApplyPrompt.anchorSlotId);
    if (!anchorSlot) return;
    const rows = buildPatternApplyRows(
      patternApplyPrompt.sectionId,
      patternApplyPrompt.roomId,
      anchorSlot,
      patternApplyPrompt.otherDays,
      assignmentsBySection,
    );
    const section = sectionById.get(patternApplyPrompt.sectionId);
    const courseLabel =
      [section?.department, String(section?.course_id ?? patternApplyPrompt.sectionId)]
        .filter(Boolean)
        .join(" ")
        .trim() || patternApplyPrompt.sectionId;
    setPatternApplyModal({
      sectionId: patternApplyPrompt.sectionId,
      roomId: patternApplyPrompt.roomId,
      anchorDay: patternApplyPrompt.anchorDay,
      anchorTimeLabel: `${formatTimeAmPm(anchorSlot.start_time)}-${formatTimeAmPm(anchorSlot.end_time)}`,
      courseLabel,
      rows,
    });
  }, [assignmentsBySection, buildPatternApplyRows, patternApplyPrompt, sectionById, timeslotById]);

  const togglePatternApplyRow = useCallback((day: Day) => {
    setPatternApplyModal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) =>
          row.day === day && (row.severity === "ok" || row.severity === "warn")
            ? { ...row, selected: !row.selected }
            : row,
        ),
      };
    });
  }, []);

  const dismissPatternApplyModal = useCallback(() => {
    setPatternApplyModal(null);
  }, []);

  const applyPatternDays = useCallback(() => {
    if (!patternApplyModal || !data) return;
    const selectedRows = patternApplyModal.rows.filter(
      (row) => row.selected && row.targetSlotId && (row.severity === "ok" || row.severity === "warn"),
    );
    if (!selectedRows.length) {
      setPatternApplyModal(null);
      return;
    }
    const { sectionId, roomId: targetRoomId } = patternApplyModal;
    const linkedSectionIds = linkedSectionIdsBySection.get(sectionId) ?? [sectionId];

    // Extending across days is a separate user action from the drag, so give it its
    // own undo entry.
    pushUndoSnapshot({
      assignmentsBySection,
      solverTimeslotIdsBySection,
      backendSaveMessage,
      dragFeedback,
      conflictSectionIds,
    });

    const dayToSlotId = new Map<Day, string>();
    for (const row of selectedRows) {
      if (row.targetSlotId) dayToSlotId.set(row.day, row.targetSlotId);
    }

    const nextAssignments: AssignmentMap = { ...assignmentsBySection };
    const nextSolverTimeslots: Record<string, string[]> = {};
    for (const linkedSectionId of linkedSectionIds) {
      const current = assignmentsBySection[linkedSectionId];
      const currentIds = current?.timeslot_ids ?? [];
      const updated = currentIds.map((id) => {
        const slot = timeslotById.get(id);
        if (!slot) return id;
        for (const [day, newSlotId] of Array.from(dayToSlotId)) {
          if (timeslotMatchesDay(slot, day)) return newSlotId;
        }
        return id;
      });
      const uniqueIds = Array.from(new Set(updated));
      nextAssignments[linkedSectionId] = {
        timeslot_ids: uniqueIds,
        room_id: targetRoomId,
        meeting_pattern_id: current?.meeting_pattern_id ?? "",
      };
      nextSolverTimeslots[linkedSectionId] = uniqueIds;
    }
    setAssignmentsBySection(nextAssignments);
    setSolverTimeslotIdsBySection((prev) => ({ ...prev, ...nextSolverTimeslots }));

    const appliedDays = selectedRows.map((row) => row.day);
    const warnDays = selectedRows.filter((row) => row.severity === "warn").map((row) => row.day);
    const skippedDays = patternApplyModal.rows
      .filter((row) => !selectedRows.includes(row))
      .map((row) => row.day);

    const parts = [
      `Applied ${patternApplyModal.anchorTimeLabel} to ${appliedDays.join(", ")}.`,
    ];
    if (warnDays.length) {
      parts.push(
        `${warnDays.join(", ")} applied with a conflict — review those days for staggering.`,
      );
    }
    if (skippedDays.length) {
      parts.push(`Left unchanged: ${skippedDays.join(", ")}.`);
    }
    setDragFeedback({
      status: warnDays.length ? "warning" : "valid",
      message: parts.join(" "),
    });

    setPatternApplyModal(null);
    setPatternApplyPrompt(null);
  }, [
    assignmentsBySection,
    backendSaveMessage,
    conflictSectionIds,
    data,
    dragFeedback,
    linkedSectionIdsBySection,
    patternApplyModal,
    pushUndoSnapshot,
    solverTimeslotIdsBySection,
    timeslotById,
  ]);

  const findRoomIdAtClientY = useCallback(
    (clientY: number): string | null => {
      for (const { room } of roomRows) {
        const el = roomTrackRefs.current[room.id];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) return room.id;
      }
      return null;
    },
    [roomRows],
  );

  const minutesFromPointerInRoom = useCallback(
    (clientX: number, roomId: string): number | null => {
      const el = roomTrackRefs.current[roomId];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const pct = clamp((clientX - r.left) / r.width, 0, 1);
      return axisStart + pct * axisRange;
    },
    [axisRange, axisStart],
  );

  const activeCalendarDragPointerId = calendarDrag?.pointerId;

  useEffect(() => {
    if (activeCalendarDragPointerId == null) {
      calendarDragPointerYRef.current = null;
      return;
    }
    const pointerId = activeCalendarDragPointerId;
    const onPointerMoveDoc = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      calendarDragPointerYRef.current = ev.clientY;
    };
    document.addEventListener("pointermove", onPointerMoveDoc, { capture: true });

    const edgePx = 120;
    const maxStep = 48;
    let rafId = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const y = calendarDragPointerYRef.current;
      if (y != null) {
        const rows = calendarRoomRowsRef.current;
        const firstRoomId = rows[0]?.room.id;
        const lastRoomId = rows[rows.length - 1]?.room.id;
        const inner = calendarScrollContainerRef.current;
        const headerEl = typeof document !== "undefined" ? document.querySelector("header") : null;
        const navbarBottom = headerEl ? headerEl.getBoundingClientRect().bottom : 64;
        const vh = typeof window !== "undefined" ? window.innerHeight : 0;
        const innerRect = inner?.getBoundingClientRect();

        let upIntensity = 0;
        if (y < navbarBottom + edgePx) {
          upIntensity = Math.max(upIntensity, clamp((navbarBottom + edgePx - y) / edgePx, 0, 1));
        }
        if (innerRect && y < innerRect.top + edgePx) {
          upIntensity = Math.max(
            upIntensity,
            clamp((innerRect.top + edgePx - y) / edgePx, 0, 1),
          );
        }

        let downIntensity = 0;
        if (y > vh - edgePx) {
          downIntensity = Math.max(downIntensity, clamp((y - (vh - edgePx)) / edgePx, 0, 1));
        }
        if (innerRect && y > innerRect.bottom - edgePx) {
          downIntensity = Math.max(
            downIntensity,
            clamp((y - (innerRect.bottom - edgePx)) / edgePx, 0, 1),
          );
        }

        if (upIntensity > 0) {
          const step = maxStep * upIntensity * upIntensity;
          if (inner && inner.scrollTop > 0) {
            inner.scrollTop = Math.max(0, inner.scrollTop - step);
          }
          const firstTrack = firstRoomId ? roomTrackRefs.current[firstRoomId] : null;
          if (firstTrack) {
            const firstTop = firstTrack.getBoundingClientRect().top;
            if (firstTop < navbarBottom - 0.5) {
              window.scrollBy(0, -step);
            }
          }
        }

        if (downIntensity > 0) {
          const step = maxStep * downIntensity * downIntensity;
          if (inner) {
            const maxInner = inner.scrollHeight - inner.clientHeight;
            if (inner.scrollTop < maxInner - 0.5) {
              inner.scrollTop = Math.min(maxInner, inner.scrollTop + step);
            }
          }
          const lastTrack = lastRoomId ? roomTrackRefs.current[lastRoomId] : null;
          if (lastTrack) {
            const lastBottom = lastTrack.getBoundingClientRect().bottom;
            if (lastBottom > vh - 0.5) {
              window.scrollBy(0, step);
            }
          }
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    return () => {
      stopped = true;
      window.cancelAnimationFrame(rafId);
      document.removeEventListener("pointermove", onPointerMoveDoc, { capture: true });
      calendarDragPointerYRef.current = null;
    };
  }, [activeCalendarDragPointerId]);

  const evaluatePlacement = useCallback(
    (sectionId: string, targetRoomId: string, slot: TimeslotWithMinutes): PlacementEvaluation => {
      if (!data) {
        return {
          severity: "block",
          reasonCode: "missing_data",
          message: "Calendar data is unavailable.",
          conflictSectionIds: [],
        };
      }
      const linkedSectionIds = linkedSectionIdsBySection.get(sectionId) ?? [sectionId];
      return evaluatePlacementShared({
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
        formatTime: formatTimeAmPm,
      });
    },
    [
      allDayEvents,
      assignmentsBySection,
      data,
      findBlockedPlacementMessage,
      instructorById,
      linkedSectionIdsBySection,
      selectedDay,
    ],
  );

  const commitPlacementByClick = useCallback(
    (sectionId: string, targetRoomId: string, slot: TimeslotWithMinutes) => {
      const check = evaluatePlacement(sectionId, targetRoomId, slot);
      // Hard blocks (blocked time, capacity) never apply the move — matches drag.
      if (check.severity === "block") {
        setDragFeedback({ status: "invalid", message: check.message });
        return;
      }
      const isWarning = check.severity === "warn";
      const linkedSectionIds = linkedSectionIdsBySection.get(sectionId) ?? [sectionId];
      const needsPatternSelection = pendingPlacementSectionId === sectionId;
      const patternOptions = needsPatternSelection
        ? buildMeetingPatternOptionsForPlacement(sectionId, slot.id)
        : [];
      if (needsPatternSelection && patternOptions.length === 0) {
        const message =
          "No compatible meeting patterns include this day/time. Suggested fix: place the section in a different timeslot or update meeting pattern compatibility.";
        setDragFeedback({ status: "invalid", message });
        setBackendSaveMessage({ type: "error", text: message });
        return;
      }
      const nextAssignments: AssignmentMap = {
        ...assignmentsBySection,
      };
      for (const linkedSectionId of linkedSectionIds) {
        const currentAssignment = assignmentsBySection[linkedSectionId];
        nextAssignments[linkedSectionId] = {
          timeslot_ids: [slot.id],
          room_id: targetRoomId,
          meeting_pattern_id: currentAssignment?.meeting_pattern_id ?? "",
        };
      }
      // Capture pre-click state before mutating so a modal dismiss can restore it
      // and so undo (drag or click) reverts to the exact prior view.
      const revertAssignments = assignmentsBySection;
      const revertSolverTimeslots = solverTimeslotIdsBySection;
      const revertBackendSaveMessage = backendSaveMessage;
      const revertDragFeedback = dragFeedback;
      const revertConflictSectionIds = Array.from(conflictSectionIds);
      setAssignmentsBySection(nextAssignments);
      setSolverTimeslotIdsBySection((prev) => ({
        ...prev,
        ...Object.fromEntries(
          linkedSectionIds.map((linkedSectionId) => [linkedSectionId, [slot.id]]),
        ),
      }));
      if (needsPatternSelection) {
        // Defer persistence until the user chooses a meeting pattern. Applying
        // the local preview only keeps the backend clean if they cancel (C5).
        // The undo entry is pushed on apply (not here) so a cancel leaves the
        // undo stack untouched.
        setMeetingPatternSelectionModal({
          sectionId,
          roomId: targetRoomId,
          anchorSlotId: slot.id,
          options: patternOptions,
          selectedOptionKey: patternOptions[0].key,
          revertAssignments,
          revertSolverTimeslots,
          revertBackendSaveMessage,
          revertDragFeedback,
          revertConflictSectionIds,
        });
        setMeetingPatternSelectionError(null);
      } else {
        // Push undo before persisting so undo reverts local state and can skip a
        // backend write (Phase 2 defer-persist alignment, issue C6).
        pushUndoSnapshot({
          assignmentsBySection: revertAssignments,
          solverTimeslotIdsBySection: revertSolverTimeslots,
          backendSaveMessage: revertBackendSaveMessage,
          dragFeedback: revertDragFeedback,
          conflictSectionIds: revertConflictSectionIds,
        });
        void persistCalendarAssignments(nextAssignments);
      }
      setPendingPlacementSectionId(null);
      setPlacementPreview(null);
      // Warning placements are applied and highlighted (matches drag semantics).
      if (isWarning && !needsPatternSelection) {
        setConflictSectionIds(new Set(check.conflictSectionIds));
      } else {
        setConflictSectionIds(new Set());
      }
      setDragFeedback({
        status: needsPatternSelection ? "valid" : isWarning ? "warning" : "valid",
        message: needsPatternSelection
          ? "Section placed. Choose a meeting pattern to map this section across its additional days."
          : check.message,
      });
      setBackendSaveMessage(
        needsPatternSelection
          ? {
              type: "success",
              text: "Section placed. Select a meeting pattern to finish multi-day mapping.",
            }
          : isWarning
            ? {
                type: "success",
                text:
                  "Placement applied with a conflict — highlighted sections show the overlap. You can still save this placement.",
              }
            : {
                type: "success",
                text:
                  linkedSectionIds.length > 1
                    ? "Cross-listed group placed on the calendar. Click Save to persist this placement."
                    : "Section placed on the calendar. Click Save to persist this placement.",
              },
      );
    },
    [
      assignmentsBySection,
      backendSaveMessage,
      buildMeetingPatternOptionsForPlacement,
      conflictSectionIds,
      dragFeedback,
      evaluatePlacement,
      linkedSectionIdsBySection,
      pendingPlacementSectionId,
      persistCalendarAssignments,
      pushUndoSnapshot,
      solverTimeslotIdsBySection,
    ],
  );

  const handleUpdateBackend = async (silent = false) => {
    if (!data || !hasValidUnsavedEdit) return;
    setIsSavingBackend(true);
    setBackendSaveMessage(null);
    try {
      const mergedSections = data.sections.map((section) => {
        const assignment = assignmentsBySection[section.id];
        return {
          ...section,
          room_id:
            assignment?.room_id ??
            (section as unknown as { room_id?: string | null }).room_id ??
            null,
          timeslot_id:
            assignment?.timeslot_ids?.[0] ??
            (section as unknown as { timeslot_id?: string | null }).timeslot_id ??
            null,
          previous_meeting_pattern:
            assignment?.meeting_pattern_id ??
            (section as unknown as { previous_meeting_pattern?: string | null }).previous_meeting_pattern ??
            null,
        };
      });
      const response = await fetch("/api/update-sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: mergedSections }),
      });
      const payload = (await response.json()) as
        | { status: "ok" }
        | { status: "error"; errors?: { message?: string }[] };
      if (!response.ok || payload.status === "error") {
        const message =
          payload.status === "error" && payload.errors?.length
            ? payload.errors.map((e) => e.message).filter(Boolean).join(" | ")
            : "Backend failed to update sections.";
        throw new Error(message);
      }
      setData((prev) => (prev ? { ...prev, sections: mergedSections } : prev));
      setBaselineAssignments(assignmentsBySection);
      if (solverInput) {
        const nextInput: SchedulingInput = {
          ...solverInput,
          sections: toSchedulingSections(mergedSections),
        };
        setSolverInput(nextInput);
        updateLastRunStorage(nextInput, assignmentsBySection);
      }
      if (!silent) {
        setBackendSaveMessage({
          type: "success",
          text: "Saved. Sections will appear in the Sections editor and be used by Run Solver.",
        });
      }
      if (typeof window !== "undefined") {
        await recordOwnServerWrite();
        window.dispatchEvent(new Event(SCHEDULING_DATA_REFRESH_EVENT));
      }
    } catch (err) {
      setBackendSaveMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save.",
      });
    } finally {
      setIsSavingBackend(false);
    }
  };

  const updateBackendRef = useRef(handleUpdateBackend);
  updateBackendRef.current = handleUpdateBackend;

  // Autosave: when enabled and there's a valid unsaved edit, silently persist
  // after a short debounce so users don't have to click Save.
  useEffect(() => {
    if (!autoSaveEnabled) return;
    if (!hasValidUnsavedEdit) return;
    if (isSavingBackend) return;
    const timer = window.setTimeout(() => {
      void updateBackendRef.current(true);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [autoSaveEnabled, hasValidUnsavedEdit, isSavingBackend, assignmentsBySection]);

  const handleSaveSectionModal = useCallback(async () => {
    if (!data || !sectionModal) return;
    setSectionModalError(null);

    const validationError = validateSectionDraft(
      sectionModal.draft,
      sectionModal.mode,
      sectionModal.initialSectionId,
    );
    if (validationError) {
      setSectionModalError(validationError);
      return;
    }

    const draft = sectionModal.draft;
    const existingSection =
      sectionModal.mode === "edit"
        ? data.sections.find((section) => section.id === sectionModal.initialSectionId) ?? null
        : null;
    const existingAssignment =
      sectionModal.mode === "edit" && existingSection
        ? assignmentsBySection[existingSection.id]
        : undefined;
    const existingSolverTimeslotIds =
      sectionModal.mode === "edit" && existingSection
        ? solverTimeslotIdsBySection[existingSection.id]
        : undefined;
    const preservedTimeslotIds =
      sectionModal.mode === "edit"
        ? existingAssignment?.timeslot_ids?.length
          ? existingAssignment.timeslot_ids
          : existingSolverTimeslotIds?.length
            ? existingSolverTimeslotIds
            : existingSection?.timeslot_id
              ? [existingSection.timeslot_id]
              : []
        : [];
    const preservedRoomId =
      sectionModal.mode === "edit"
        ? existingAssignment?.room_id ?? existingSection?.room_id ?? ""
        : "";

    const normalizedSection: SectionDto = {
      id: draft.id.trim(),
      course_id: draft.course_id.trim(),
      department: draft.department.trim(),
      section_code: draft.section_code.trim(),
      instructor_id: draft.instructor_id.trim(),
      expected_enrollment: Number(draft.expected_enrollment),
      enrollment_cap: Number(draft.enrollment_cap),
      allowed_meeting_patterns: splitCsv(draft.allowed_meeting_patterns),
      room_requirements: splitCsv(draft.room_requirements),
      crosslist_group_id: draft.crosslist_group_id.trim() || null,
      tags: splitCsv(draft.tags),
      room_id: preservedRoomId || null,
      timeslot_id: preservedTimeslotIds[0] ?? null,
      previous_meeting_pattern:
        assignmentsBySection[draft.id.trim()]?.meeting_pattern_id ??
        existingSection?.previous_meeting_pattern ??
        null,
    };

    let nextSections: SectionDto[];
    if (sectionModal.mode === "create") {
      nextSections = [...data.sections, normalizedSection];
    } else {
      nextSections = data.sections.map((section) =>
        section.id === sectionModal.initialSectionId ? normalizedSection : section,
      );
    }

    setIsSavingSection(true);
    try {
      await persistSections(nextSections);

      const nextAssignments: AssignmentMap = {
        ...assignmentsBySection,
        [normalizedSection.id]: {
          timeslot_ids:
            sectionModal.mode === "edit" ? [...preservedTimeslotIds] : [],
          room_id: sectionModal.mode === "edit" ? preservedRoomId : "",
          meeting_pattern_id: assignmentsBySection[normalizedSection.id]?.meeting_pattern_id ?? "",
        },
      };
      const nextSolverTimeslots = {
        ...solverTimeslotIdsBySection,
        [normalizedSection.id]:
          sectionModal.mode === "edit" ? [...preservedTimeslotIds] : [],
      };

      setData((prev) => (prev ? { ...prev, sections: nextSections } : prev));

      setAssignmentsBySection(nextAssignments);
      setSolverTimeslotIdsBySection(nextSolverTimeslots);
      setBaselineAssignments(nextAssignments);

      if (solverInput) {
        const nextInput: SchedulingInput = {
          ...solverInput,
          sections: toSchedulingSections(nextSections),
        };
        setSolverInput(nextInput);
        updateLastRunStorage(nextInput, nextAssignments);
      }

      setBackendSaveMessage({
        type: "success",
        text:
          sectionModal.mode === "create"
            ? "Section created. Click an available room/timeslot space to place it, then choose a meeting pattern."
            : "Section updates saved to backend.",
      });
      if (typeof window !== "undefined") {
        await recordOwnServerWrite();
        window.dispatchEvent(new Event(SCHEDULING_DATA_REFRESH_EVENT));
      }
      if (sectionModal.mode === "create") {
        setPendingPlacementSectionId(normalizedSection.id);
        setDragFeedback({
          status: "neutral",
          message:
            "New section created. Hover over available room/timeslot space, then click to place it. You will choose the meeting pattern next.",
        });
      }
      setSectionModal(null);
    } catch (err) {
      setSectionModalError(err instanceof Error ? err.message : "Failed to save section.");
    } finally {
      setIsSavingSection(false);
    }
  }, [
    assignmentsBySection,
    data,
    persistSections,
    recordOwnServerWrite,
    sectionModal,
    solverInput,
    solverTimeslotIdsBySection,
    toSchedulingSections,
    validateSectionDraft,
  ]);

  const openSaveScheduleModal = useCallback(() => {
    const now = new Date();
    const defaultName = `Schedule ${now.toLocaleDateString()} ${now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    setSaveScheduleModal({
      isOpen: true,
      isSaving: false,
      error: null,
      draft: {
        name: defaultName,
        scheduleDate: todayAsIsoDate(),
      },
    });
  }, []);

  const closeSaveScheduleModal = useCallback(() => {
    setSaveScheduleModal((prev) => ({ ...prev, isOpen: false, error: null }));
  }, []);

  const updateSaveScheduleDraft = useCallback(
    (patch: Partial<SaveScheduleDraft>) => {
      setSaveScheduleModal((prev) => ({
        ...prev,
        draft: { ...prev.draft, ...patch },
      }));
    },
    [],
  );

  const buildSnapshotFromCurrentView = useCallback(
    async (): Promise<LastSolverRunSnapshot> => {
      let inputForSnapshot: SchedulingInput | null = solverInput;
      if (!inputForSnapshot) {
        const res = await fetch("/api/data", { method: "GET" });
        const json = (await res.json()) as
          | { status: "ok"; data: SchedulingInput }
          | { status: "error"; errors?: { message?: string }[] };
        if (!res.ok || json.status !== "ok") {
          const msg =
            json.status === "error"
              ? (json.errors ?? []).map((e) => e.message).filter(Boolean).join(" | ")
              : "Unable to load scheduling data to save history snapshot.";
          throw new Error(msg || "Unable to load scheduling data.");
        }
        inputForSnapshot = json.data;
      }

      const assignments = Object.entries(assignmentsBySection).map(([section_id, value]) => ({
        section_id,
        timeslot_ids: value.timeslot_ids,
        room_id: value.room_id,
        meeting_pattern_id: value.meeting_pattern_id,
      }));

      return {
        input: {
          ...inputForSnapshot,
          locked_assignments: mergePlacementLocks(
            inputForSnapshot.locked_assignments ?? [],
            lockedSectionIds,
            assignmentsBySection,
            data?.sections ?? [],
          ),
        },
        solution: {
          assignments,
          total_score: 0,
          penalty_breakdown: {},
          explanations: [],
        },
        createdAt: new Date().toISOString(),
        lockedSectionIds,
      };
    },
    [assignmentsBySection, data?.sections, lockedSectionIds, solverInput],
  );

  const handleSaveScheduleToHistory = useCallback(async () => {
    const trimmedName = saveScheduleModal.draft.name.trim();
    if (!trimmedName) {
      setSaveScheduleModal((prev) => ({
        ...prev,
        error: "Schedule name is required.",
      }));
      return;
    }
    if (!saveScheduleModal.draft.scheduleDate) {
      setSaveScheduleModal((prev) => ({
        ...prev,
        error: "Schedule date is required.",
      }));
      return;
    }
    setSaveScheduleModal((prev) => ({ ...prev, isSaving: true, error: null }));
    try {
      const snapshot = await buildSnapshotFromCurrentView();
      saveScheduleToHistory({
        name: trimmedName,
        scheduleDate: saveScheduleModal.draft.scheduleDate,
        savedBy: user?.name,
        snapshot,
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          LAST_SOLVER_RUN_STORAGE_KEY,
          JSON.stringify(snapshot),
        );
      }
      // The current iteration is now saved, so a re-run won't be flagged unsaved.
      setLastHistorySavedSignature(assignmentsSignature(assignmentsBySection));
      setSaveScheduleModal((prev) => ({ ...prev, isOpen: false, isSaving: false, error: null }));
      setBackendSaveMessage({
        type: "success",
        text: `Saved "${trimmedName}" to Schedule History.`,
      });
    } catch (e) {
      setSaveScheduleModal((prev) => ({
        ...prev,
        isSaving: false,
        error: e instanceof Error ? e.message : "Failed to save schedule history.",
      }));
    }
  }, [assignmentsBySection, buildSnapshotFromCurrentView, saveScheduleModal.draft.name, saveScheduleModal.draft.scheduleDate, user?.name]);

  if (error) {
    return (
      <div className="bg-rose-50 p-6 rounded-xl border border-rose-100 shadow-sm text-rose-900">
        <div className="flex items-center gap-2 font-bold">
          <AlertTriangle className="size-5 text-rose-500" />
          Failed to load calendar data
        </div>
        <div className="text-sm mt-2">{error}</div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-slate-500">Loading…</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <CalendarHistoryNavbarPortal
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
      <CalendarDragFeedbackToastPortal
        mountedOn={dragFeedbackToastMount}
        dragFeedback={dragFeedback}
        action={
          patternApplyPrompt && dragFeedback.status === "warning"
            ? { label: "Apply to all pattern days", onClick: openPatternApplyModal }
            : null
        }
        onDismiss={() => {
          setDragFeedback({ status: "neutral", message: null });
          setConflictSectionIds(new Set());
          setPatternApplyPrompt(null);
        }}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col justify-start">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Schedule Output Calendar
          </h1>
          <p className="mt-1 text-base leading-6 text-slate-500">
            Click through Monday–Friday to view scheduled sections.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 w-full md:w-auto">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
            <div
              onMouseEnter={() =>
                setToolbarActionHint(
                  solverBusyRemote
                    ? solverLock.startedBy
                      ? `Solver is running (started by ${solverLock.startedBy}). Please wait.`
                      : "Solver is running. Please wait."
                    : "Run solver using current data and placement locks.",
                )
              }
              onMouseLeave={() => setToolbarActionHint(null)}
              onFocus={() =>
                setToolbarActionHint(
                  solverBusyRemote
                    ? solverLock.startedBy
                      ? `Solver is running (started by ${solverLock.startedBy}). Please wait.`
                      : "Solver is running. Please wait."
                    : "Run solver using current data and placement locks.",
                )
              }
              onBlur={() => setToolbarActionHint(null)}
              className="contents"
            >
              <button
                type="button"
                disabled={
                  solverRunStatus === "loading" || !data || solverBusyRemote
                }
                onClick={() => void handleRunSolverFromCalendar()}
                className={clsx(
                  "flex items-center justify-center rounded-lg size-10 font-bold border transition-colors",
                  solverRunStatus !== "loading" && data && !solverBusyRemote
                    ? "bg-[#137fec] text-white border-[#137fec] shadow-lg shadow-[#137fec]/20 hover:bg-[#0f6dca]"
                    : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed",
                )}
                title={
                  solverBusyRemote
                    ? solverLock.startedBy
                      ? `Solver is running (started by ${solverLock.startedBy})`
                      : "Solver is running"
                    : "Run the solver using backend scheduling data and locks from this page"
                }
                aria-label="Run solver"
              >
                <Play className="size-4" />
              </button>
            </div>
            {!autoSaveEnabled && hasValidUnsavedEdit && (
              <div
                onMouseEnter={() =>
                  setToolbarActionHint("Autosave is off — click Save to persist calendar edits.")
                }
                onMouseLeave={() => setToolbarActionHint(null)}
                className="flex items-center pl-1 pr-2"
              >
                <button
                  type="button"
                  disabled={isSavingBackend}
                  onClick={() => void handleUpdateBackend(false)}
                  className={clsx(
                    "flex items-center justify-center rounded-lg h-8 px-3 text-xs font-bold border transition-colors",
                    isSavingBackend
                      ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                      : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100",
                  )}
                  title="Save valid calendar edits"
                  aria-label="Save"
                >
                  <CloudBackup className="size-4 mr-1" />
                  Save
                </button>
              </div>
            )}
            <div className="hidden lg:block h-7 w-px bg-slate-200 mx-1" />
            <button
              type="button"
              onClick={openSaveScheduleModal}
              onMouseEnter={() => setToolbarActionHint("Save this schedule snapshot to history.")}
              onMouseLeave={() => setToolbarActionHint(null)}
              onFocus={() => setToolbarActionHint("Save this schedule snapshot to history.")}
              onBlur={() => setToolbarActionHint(null)}
              className="flex items-center justify-center rounded-lg size-10 bg-indigo-50 text-indigo-800 font-bold border border-indigo-200 hover:bg-indigo-100 transition-colors"
              title="Save this generated/edited schedule to history"
              aria-label="Save schedule"
            >
              <Save className="size-4" />
            </button>
            <button
              onMouseEnter={() => setToolbarActionHint("Export the visible calendar to PDF.")}
              onMouseLeave={() => setToolbarActionHint(null)}
              onFocus={() => setToolbarActionHint("Export the visible calendar to PDF.")}
              onBlur={() => setToolbarActionHint(null)}
              className="flex items-center justify-center rounded-lg size-10 bg-slate-100 text-slate-900 font-bold border border-slate-200 hover:bg-slate-200 transition-colors"
              onClick={handleExportPdf}
              aria-label="Export PDF"
            >
              <Share2 className="size-4" />
            </button>
            <div className="hidden lg:block h-7 w-px bg-slate-200 mx-1" />
            <button
              type="button"
              onClick={() => setScheduleDrawerOpen(true)}
              onMouseEnter={() => setToolbarActionHint("Open the schedule table to bulk lock/unlock sections for the solver.")}
              onMouseLeave={() => setToolbarActionHint(null)}
              onFocus={() => setToolbarActionHint("Open the schedule table to bulk lock/unlock sections for the solver.")}
              onBlur={() => setToolbarActionHint(null)}
              className="relative flex items-center justify-center rounded-lg size-10 bg-slate-100 text-slate-800 font-bold border border-slate-200 hover:bg-slate-200 transition-colors"
              title="Open schedule table (lock sections for the solver)"
              aria-label="Open schedule table"
            >
              <Table2 className="size-4" />
              {hasAnyPlacementLock && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold leading-4 text-center">
                  {lockedSectionIds.length}
                </span>
              )}
            </button>
          </div>
          <div className="relative h-[34px] w-full">
          <div
            className={clsx(
              "rounded-lg px-3 py-2 text-xs font-semibold flex items-center transition-opacity absolute inset-0",
              toolbarActionHint
                ? "border border-slate-200 bg-slate-50 text-slate-700 opacity-100"
                : "opacity-0 pointer-events-none",
            )}
            aria-live="polite"
          >
            <span>{toolbarActionHint ?? " "}</span>
          </div>
          </div>
          {hasValidUnsavedEdit && (
            <p className="text-[11px] font-semibold text-emerald-700 px-1">
              Unsaved valid edits are ready to sync.
            </p>
          )}
        </div>
      </div>

      {backendSaveMessage && (
        <div
          className={clsx(
            "rounded-lg border px-4 py-2 text-sm font-medium",
            backendSaveMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800",
          )}
        >
          {backendSaveMessage.text}
        </div>
      )}

      {solverRunError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800">
          {solverRunError}
        </div>
      )}

      {incomingShared && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5">
          <p className="text-sm text-sky-950">
            <span className="font-semibold">
              {incomingShared.ranBy
                ? `${incomingShared.ranBy} ran the solver.`
                : "A new schedule is available."}
            </span>{" "}
            Applying it will replace the schedule currently on your screen.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                appliedSharedRevisionRef.current = incomingShared.revision;
                setIncomingShared(null);
              }}
              className="rounded-md border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 transition-colors hover:bg-sky-100"
            >
              Keep mine
            </button>
            <button
              type="button"
              onClick={() => void applySharedSnapshot()}
              className="rounded-md bg-[#137fec] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0f6dca]"
            >
              Apply new schedule
            </button>
          </div>
        </div>
      )}

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-2 min-w-[9rem]">
            <Filter className="size-4 text-slate-400" aria-hidden />
            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">
              Filters
            </span>
          </div>
          <div className="flex flex-1 flex-col sm:flex-row gap-3">
            <MultiSelect
              placeholder="Departments"
              options={departmentFilterOptions}
              value={selectedDepartmentKeys}
              onChange={setSelectedDepartmentKeys}
              showSearch
            />
            <MultiSelect
              placeholder="Professors"
              options={professorFilterOptions}
              value={selectedInstructorIds}
              onChange={setSelectedInstructorIds}
              showSearch
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedDepartmentKeys([]);
              setSelectedInstructorIds([]);
            }}
            disabled={!selectedDepartmentKeys.length && !selectedInstructorIds.length}
            className={clsx(
              "rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors self-start lg:self-auto",
              selectedDepartmentKeys.length || selectedInstructorIds.length
                ? "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed",
            )}
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Department / course color legend */}
      {departmentColorLegend.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
            <div className="flex items-center gap-2 mb-1 w-full sm:w-auto sm:mb-0 sm:mr-2">
              <Palette className="size-4 text-slate-400 shrink-0" aria-hidden />
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">
                Department colors
              </span>
            </div>
            {departmentColorLegend.map((item) => (
              <div
                key={item.colorKey}
                onMouseEnter={() => setHoveredDepartmentKey(item.colorKey)}
                onMouseLeave={() => setHoveredDepartmentKey((prev) => (prev === item.colorKey ? null : prev))}
                onClick={() => {
                  setSelectedLegendDepartmentKeys((prev) =>
                    prev.includes(item.colorKey)
                      ? prev.filter((key) => key !== item.colorKey)
                      : [...prev, item.colorKey],
                  );
                }}
                className={clsx(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 mr-1 mb-1 transition-all cursor-pointer",
                  activeLegendDepartmentKeys.has(item.colorKey)
                    ? "border-slate-300 bg-slate-100 shadow-sm ring-2 ring-slate-200"
                    : activeLegendDepartmentKeys.size > 0
                      ? "border-slate-100 bg-slate-50/60 opacity-70"
                      : "border-slate-100 bg-slate-50/80",
                )}
              >
                <span
                  className="h-3.5 w-6 shrink-0 rounded border-l-[3px] shadow-sm border border-slate-300/70"
                  style={{
                    backgroundColor: item.swatch.cardBg,
                    backgroundImage: item.swatch.cardPattern,
                    borderLeftColor: item.swatch.cardBorder,
                  }}
                  aria-hidden
                />
                <span
                  className="text-xs font-semibold text-slate-800 max-w-[12rem] truncate"
                  title={item.label}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
            Colors are per <span className="font-semibold">department</span> only. Populate the
            department field (e.g. ECON, OPRE, FAFE) to control color grouping.
          </p>
        </div>
      )}

      {crosslistGroupLegend.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
            <div className="flex items-center gap-2 mb-1 w-full sm:w-auto sm:mb-0 sm:mr-2">
              <Link2 className="size-4 text-slate-400 shrink-0" aria-hidden />
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">
                Crosslist groups
              </span>
            </div>
            {crosslistGroupLegend.map((item) => (
              <button
                key={item.groupId}
                type="button"
                onClick={() => openCrosslistGroupPicker(item.groupId, item.members)}
                className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 mr-1 mb-1 transition-all hover:border-slate-300 hover:bg-slate-100 hover:shadow-sm"
              >
                <CrosslistLegendSwatch swatch={item.swatch} />
                <span
                  className="text-xs font-semibold text-slate-800 max-w-[12rem] truncate"
                  title={item.groupId}
                >
                  {item.groupId}
                </span>
                <span className="text-[10px] font-semibold text-slate-500">
                  ({item.members.length})
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
            Click a group to view or edit the sections scheduled together in that cross-list.
          </p>
        </div>
      )}

      {/* Day selector + quick add section */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-[10px] font-bold text-slate-400 uppercase px-2 tracking-widest">
              Day:
            </span>
            {DAYS.map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDay(d)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg border text-xs font-bold whitespace-nowrap transition-colors",
                  selectedDay === d
                    ? "bg-[#137fec]/10 border-[#137fec]/20 text-[#137fec]"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:text-[#137fec] hover:bg-slate-100",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={openCreateSectionModal}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-weatherhead-primary px-4 text-sm font-bold text-white shadow-sm shadow-weatherhead-primary/20 transition-colors hover:bg-[#0f6fd0]"
        >
          <Plus className="size-4" aria-hidden />
          Add Section
        </button>
      </div>

      {/* Main calendar grid */}
      <div
        className={clsx(
          "rounded-xl border shadow-lg overflow-hidden flex flex-col min-h-[600px]",
          dragFeedback.status === "invalid"
            ? "bg-red-50/40 border-red-200"
            : dragFeedback.status === "valid"
              ? "bg-emerald-50/35 border-emerald-200"
            : "bg-white border-slate-200",
        )}
      >
        <div className="flex bg-slate-50 border-b border-slate-200">
          <div className="w-40 flex-shrink-0 border-r border-slate-200 p-4 font-bold text-[10px] uppercase text-slate-500 tracking-widest">
            Rooms \ Time
          </div>
          <div className="flex flex-1">
            {timeAxisLabels.map((t) => (
              <div
                key={t}
                className="flex-1 text-center p-4 border-r border-slate-200 text-[10px] font-bold text-slate-500"
              >
                {t}
              </div>
            ))}
          </div>
        </div>

        <div ref={calendarScrollContainerRef} className="flex-1 overflow-y-auto relative">
          <div className="flex border-b border-slate-200/80 min-h-[240px]">
            <div className="w-40 flex-shrink-0 border-r border-slate-200 bg-slate-50/30">
              {roomRows.map(({ room, rowHeight }) => {
                const roomLabel = [room.building, formatRoomNumberForDisplay(room.room_number)]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div
                    key={`label-${room.id}`}
                    className="border-b border-slate-200/80 last:border-b-0 px-3 py-3 flex flex-col justify-center"
                    style={{ minHeight: rowHeight }}
                  >
                    <span className="font-bold text-xs text-slate-900">
                      {roomLabel || room.id}
              </span>
                    <span className="text-[9px] text-slate-500 mt-1">
                      Capacity: {room.capacity ?? "N/A"}
              </span>
                  </div>
                );
              })}
            </div>
            <div className="flex-1 relative">
              {roomRows.map(({ room, visibleEvents, hiddenEvents, rowHeight }) => (
                <div
                  key={room.id}
                  ref={(el) => setRoomTrackRef(room.id, el)}
                  className="relative overflow-visible border-b border-slate-200/80 last:border-b-0 z-0 has-[[data-crosslist-hover=true]]:z-30"
                  style={{ minHeight: rowHeight }}
                  onPointerMove={(e) => {
                    if (!pendingPlacementSectionId || calendarDrag) return;
                    const mins = minutesFromPointerInRoom(e.clientX, room.id);
                    if (mins === null || !data) return;
                    const slot = selectAnySlotNearMinutes(data.timeslots, selectedDay, mins);
                    if (!slot) return;
                    const check = evaluatePlacement(pendingPlacementSectionId, room.id, slot);
                    const canPlace = check.severity !== "block";
                    setPlacementPreview({
                      targetRoomId: room.id,
                      slotId: slot.id,
                      startMin: slot.start,
                      endMin: slot.end,
                      isValid: canPlace,
                      severity: check.severity,
                      message: check.message,
                    });
                    setDragFeedback({
                      status:
                        check.severity === "block"
                          ? "invalid"
                          : check.severity === "warn"
                            ? "warning"
                            : "valid",
                      message: check.message,
                    });
                  }}
                  onPointerLeave={() => {
                    if (!pendingPlacementSectionId || calendarDrag) return;
                    setPlacementPreview(null);
                    setDragFeedback({
                      status: "neutral",
                      message:
                        "New section created. Hover over available room/timeslot space, then click to place it.",
                    });
                  }}
                  onClick={(e) => {
                    if (!pendingPlacementSectionId || calendarDrag || !data) return;
                    // Prefer an existing hover preview (desktop pointer flow).
                    // On touch, a pure tap fires no pointermove, so `placementPreview`
                    // is null — compute the slot directly from the tap's coordinates
                    // so the section places on the first tap (issue C9).
                    if (placementPreview && placementPreview.targetRoomId === room.id) {
                      const previewSlot = timeslotById.get(placementPreview.slotId);
                      if (!previewSlot) return;
                      commitPlacementByClick(pendingPlacementSectionId, room.id, {
                        ...previewSlot,
                        start: placementPreview.startMin,
                        end: placementPreview.endMin,
                      });
                      return;
                    }
                    const mins = minutesFromPointerInRoom(e.clientX, room.id);
                    if (mins === null) return;
                    const slot = selectAnySlotNearMinutes(data.timeslots, selectedDay, mins);
                    if (!slot) return;
                    commitPlacementByClick(pendingPlacementSectionId, room.id, slot);
                  }}
                >
                  {calendarDrag?.hasMoved &&
                    dragPossibleTimeslots
                      .filter((slot) => slot.end > axisStart && slot.start < axisEnd)
                      .map((slot) => {
                        const durationMin = Math.max(0, slot.end - slot.start);
                        const blockedKey = `${room.id}::${slot.id}`;
                        const isBlockedForDraggedSection = dragBlockedTimeslotInfo.blockedSlotIds.has(blockedKey);
                        const blockedReason = dragBlockedTimeslotInfo.blockedReasonBySlotId.get(blockedKey);
                        const leftPct =
                          (clamp(slot.start, axisStart, axisEnd) - axisStart) / axisRange;
                        const widthPct =
                          (clamp(slot.end, axisStart, axisEnd) -
                            clamp(slot.start, axisStart, axisEnd)) /
                          axisRange;
                        return (
                          <div
                            key={`${room.id}-ts-band-${slot.id}`}
                            className="absolute top-0 bottom-0 pointer-events-none"
                            style={{
                              left: `${leftPct * 100}%`,
                              width: `${Math.max(widthPct * 100, 0.5)}%`,
                              backgroundColor: isBlockedForDraggedSection
                                ? "rgba(220, 38, 38, 0.2)"
                                : rgbaFillForTimeslotDuration(durationMin, "strong"),
                              backgroundImage: isBlockedForDraggedSection
                                ? "repeating-linear-gradient(135deg, rgba(220,38,38,0.38) 0px, rgba(220,38,38,0.38) 5px, rgba(255,255,255,0.0) 5px, rgba(255,255,255,0.0) 10px)"
                                : undefined,
                              outline: isBlockedForDraggedSection
                                ? "1px solid rgba(220, 38, 38, 0.75)"
                                : undefined,
                              zIndex: 0,
                            }}
                            title={
                              blockedReason ??
                              `${formatTimeAmPm(slot.start_time)}–${formatTimeAmPm(slot.end_time)} (${durationMin} min)`
                            }
                          />
                        );
                      })}
                  <div
                    className="absolute inset-0 grid pointer-events-none z-[1]"
                    style={{ gridTemplateColumns: `repeat(${hourSegments}, minmax(0, 1fr))` }}
                  >
                    {Array.from({ length: hourSegments }).map((_, j) => (
                  <div
                    key={j}
                        className="border-r border-slate-300/50 last:border-r-0"
                  />
                ))}
              </div>
                  {calendarDrag?.hasMoved &&
                    dragPossibleTimeslotBoundaries.map((minute) => {
                      const leftPct = ((minute - axisStart) / axisRange) * 100;
                      return (
                        <div
                          key={`${room.id}-boundary-${minute}`}
                          className="absolute top-0 bottom-0 border-l border-red-300/70 pointer-events-none"
                          style={{ left: `${leftPct}%`, zIndex: 2 }}
                        />
                      );
                    })}
                  {hiddenEvents.map(({ section, start, end, lane }) => {
                    const leftPct = (clamp(start, axisStart, axisEnd) - axisStart) / axisRange;
                    const widthPct =
                      (clamp(end, axisStart, axisEnd) - clamp(start, axisStart, axisEnd)) /
                      axisRange;
                    const top = EVENT_TOP_PADDING_PX + lane * (EVENT_HEIGHT_PX + EVENT_GAP_PX);
                    const matchesHoveredDepartment =
                      activeLegendDepartmentKeys.size === 0 ||
                      activeLegendDepartmentKeys.has(departmentColorKey(section));
                    return (
                      <div
                        key={`${room.id}-${section.id}-occupied`}
                        className={clsx(
                          "absolute z-[6] rounded-lg border border-dashed pointer-events-none transition-all",
                          matchesHoveredDepartment
                            ? "border-slate-300 bg-slate-100/70"
                            : "border-slate-200 bg-slate-100/35 opacity-45",
                          activeLegendDepartmentKeys.size > 0 &&
                            matchesHoveredDepartment &&
                            "ring-2 ring-slate-300/80",
                        )}
                        style={{
                          left: `${leftPct * 100}%`,
                          width: `${Math.max(widthPct * 100, 0.5)}%`,
                          top,
                          height: EVENT_HEIGHT_PX,
                        }}
                        title="Occupied by filtered course"
                      >
                        <div className="h-full w-full flex items-center justify-center text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                          Occupied
                        </div>
                      </div>
                    );
                  })}
                  {calendarDrag?.hasMoved &&
                    calendarDrag.preview &&
                    room.id === calendarDrag.preview.targetRoomId &&
                    (() => {
                      const slot = timeslotById.get(calendarDrag.preview.slotId);
                      if (!slot) return null;
                      const blockedKey = `${room.id}::${slot.id}`;
                      const isBlockedForDraggedSection = dragBlockedTimeslotInfo.blockedSlotIds.has(blockedKey);
                      const durationMin = timeslotDurationMinutes(slot);
                      const bg = isBlockedForDraggedSection
                        ? "rgba(239, 68, 68, 0.2)"
                        : rgbaFillForTimeslotDuration(durationMin, "strong");
                      const border = isBlockedForDraggedSection
                        ? "rgba(220, 38, 38, 0.85)"
                        : rgbaBorderForTimeslotDuration(durationMin);
                      const slotStartM = parseMinutes(slot.start_time);
                      const slotEndM = parseMinutes(slot.end_time);
                      const leftPct =
                        (clamp(slotStartM, axisStart, axisEnd) - axisStart) / axisRange;
                      const widthPct =
                        (clamp(slotEndM, axisStart, axisEnd) -
                          clamp(slotStartM, axisStart, axisEnd)) /
                        axisRange;
                      const highlightTop =
                        0;
                      return (
                        <div
                          key={`${room.id}-slot-highlight-${calendarDrag.preview.slotId}`}
                          className="absolute rounded-md pointer-events-none"
                          style={{
                            left: `${leftPct * 100}%`,
                            width: `${Math.max(widthPct * 100, 0.5)}%`,
                            top: highlightTop,
                            height: "100%",
                            backgroundColor: bg,
                            border: `1px solid ${border}`,
                            zIndex: 3,
                          }}
                        />
                      );
                    })()}
                  {pendingPlacementSectionId &&
                    placementPreview &&
                    room.id === placementPreview.targetRoomId &&
                    (() => {
                      const slot = timeslotById.get(placementPreview.slotId);
                      const section = data.sections.find((s) => s.id === pendingPlacementSectionId);
                      if (!slot || !section) return null;
                      const leftPct =
                        (clamp(placementPreview.startMin, axisStart, axisEnd) - axisStart) /
                        axisRange;
                      const widthPct =
                        (clamp(placementPreview.endMin, axisStart, axisEnd) -
                          clamp(placementPreview.startMin, axisStart, axisEnd)) /
                        axisRange;
                      const bg =
                        placementPreview.severity === "warn"
                          ? "rgba(245, 158, 11, 0.16)"
                          : placementPreview.isValid
                            ? "rgba(16, 185, 129, 0.16)"
                            : "rgba(239, 68, 68, 0.16)";
                      const border =
                        placementPreview.severity === "warn"
                          ? "rgba(217, 119, 6, 0.75)"
                          : placementPreview.isValid
                            ? "rgba(5, 150, 105, 0.75)"
                            : "rgba(220, 38, 38, 0.75)";
                      const color =
                        departmentPaletteByKey.get(departmentColorKey(section)) ?? solidPaletteAt(0);
                      return (
                        <div
                          key={`placement-preview-${room.id}-${pendingPlacementSectionId}`}
                          className="absolute z-[24] pointer-events-none border-l-4 rounded-lg p-2.5 flex flex-col justify-between shadow-sm"
                          style={{
                            left: `${leftPct * 100}%`,
                            width: `${Math.max(widthPct * 100, 0.5)}%`,
                            top: EVENT_TOP_PADDING_PX,
                            height: EVENT_HEIGHT_PX,
                            backgroundColor: bg,
                            backgroundImage: color.cardPattern,
                            borderLeftColor: color.cardBorder,
                            outline: `2px solid ${border}`,
                          }}
                        >
                          <div className="font-black text-[10px] truncate text-slate-900">
                            {(section.department ? `${section.department} ` : "") + section.course_id}
                          </div>
                          <div className="text-[8px] font-bold text-slate-700 uppercase">
                            {placementPreview.isValid
                              ? placementPreview.severity === "warn"
                                ? "Click to place (conflict)"
                                : "Click to place"
                              : "Cannot place here"}
                          </div>
                        </div>
                      );
                    })()}

                  {visibleEvents.map((event) => {
                    const { section, timeslot, start, end, lane } = event;
                    const leftPct =
                      (clamp(start, axisStart, axisEnd) - axisStart) / axisRange;
                    const widthPct =
                      (clamp(end, axisStart, axisEnd) - clamp(start, axisStart, axisEnd)) /
                      axisRange;
                    const top = EVENT_TOP_PADDING_PX + lane * (EVENT_HEIGHT_PX + EVENT_GAP_PX);
                    const timeLabel = `${formatTimeAmPm(timeslot?.start_time ?? "00:00")} - ${formatTimeAmPm(timeslot?.end_time ?? "00:00")}`;
                    const color =
                      departmentPaletteByKey.get(departmentColorKey(section)) ?? solidPaletteAt(0);
                    const matchesHoveredDepartment =
                      isCrosslistGroupEvent(event)
                        ? (event.crosslistMembers ?? []).some((member) =>
                            activeLegendDepartmentKeys.size === 0 ||
                            activeLegendDepartmentKeys.has(departmentColorKey(member)),
                          )
                        : activeLegendDepartmentKeys.size === 0 ||
                          activeLegendDepartmentKeys.has(departmentColorKey(section));
                    const dragSectionId = isCrosslistGroupEvent(event)
                      ? section.id
                      : section.id;
                    const isDragSource = calendarDrag?.sectionId === dragSectionId;
                    const placementLocked = isCrosslistGroupEvent(event)
                      ? (event.crosslistMembers ?? []).some((member) =>
                          isPlacementLocked(member.id),
                        )
                      : isPlacementLocked(section.id);

                    const sharedPointerHandlers = {
                      onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCalendarContextMenu({
                          clientX: e.clientX,
                          clientY: e.clientY,
                          sectionId: section.id,
                        });
                      },
                      onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
                        if (!solverInput || e.button !== 0) return;
                        e.stopPropagation();
                        e.preventDefault();
                        // Locked placements (or any locked cross-list peer) must not
                        // start a drag — corruption guard for solver-pinned sections.
                        if (placementLocked) {
                          setCalendarDrag(null);
                          setDragFeedback({
                            status: "invalid",
                            message:
                              "This section is locked for the solver. Unlock it in the schedule table to move it.",
                          });
                          return;
                        }
                        calendarDragPointerYRef.current = e.clientY;
                        const targetEl = e.currentTarget;
                        targetEl.setPointerCapture(e.pointerId);
                        setConflictSectionIds(new Set());
                        setBackendSaveMessage(null);
                        setCalendarDrag({
                          sectionId: dragSectionId,
                          pointerId: e.pointerId,
                          startX: e.clientX,
                          startY: e.clientY,
                          hasMoved: false,
                          originLane: lane,
                          preview: {
                            targetRoomId: room.id,
                            slotId: timeslot!.id,
                            startMin: start,
                            endMin: end,
                          },
                        });
                      },
                      onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
                        const prev = calendarDrag;
                        if (!prev || e.pointerId !== prev.pointerId) return;
                        const dist = Math.hypot(e.clientX - prev.startX, e.clientY - prev.startY);
                        const hasMoved =
                          prev.hasMoved || dist > CALENDAR_DRAG_MOVE_THRESHOLD_PX;
                        const keepHasMoved = () => {
                          if (hasMoved !== prev.hasMoved) {
                            setCalendarDrag({ ...prev, hasMoved });
                          }
                        };
                        if (!data) return keepHasMoved();
                        const draggedE = findCalendarEventBySectionId(allDayEvents, prev.sectionId);
                        if (!draggedE) return keepHasMoved();
                        // Snap targets use the same allowed durations as the highlight
                        // bands so every highlighted band is a valid drop target (C8).
                        const allowedDurations = getAllowedSlotDurationsForDrag(
                          prev.sectionId,
                          assignmentsBySection,
                          data,
                          solverInput ?? null,
                          selectedDay,
                          timeslotById,
                          allDayEvents,
                        );
                        const roomId =
                          findRoomIdAtClientY(e.clientY) ??
                          draggedE.section.room_id ??
                          "";
                        if (!roomId) return keepHasMoved();
                        const mins = minutesFromPointerInRoom(e.clientX, roomId);
                        if (mins === null) return keepHasMoved();
                        const slot = selectSlotNearMinutes(
                          data.timeslots,
                          selectedDay,
                          allowedDurations,
                          mins,
                        );
                        if (!slot) {
                          keepHasMoved();
                          // No highlighted band under the pointer — tell the user why the
                          // preview isn't following instead of freezing silently (C8).
                          setDragFeedback({
                            status: "invalid",
                            message:
                              "No compatible slot here for this section's meeting length.",
                          });
                          return;
                        }
                        setCalendarDrag({
                          ...prev,
                          hasMoved,
                          preview: {
                            targetRoomId: roomId,
                            slotId: slot.id,
                            startMin: slot.start,
                            endMin: slot.end,
                          },
                        });
                      },
                      onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
                        setCalendarDrag((prev) => {
                          if (!prev || e.pointerId !== prev.pointerId) return prev;
                          try {
                            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                          } catch {
                            /* noop */
                          }
                          const moved =
                            prev.hasMoved ||
                            Math.hypot(e.clientX - prev.startX, e.clientY - prev.startY) >
                              CALENDAR_DRAG_MOVE_THRESHOLD_PX;
                          if (!moved) {
                            suppressCardClickRef.current = false;
                          } else {
                            suppressCardClickRef.current = true;
                            const slotFull = timeslotById.get(prev.preview.slotId);
                            if (slotFull) {
                              commitCalendarPlacement(prev.sectionId, prev.preview.targetRoomId, {
                                ...slotFull,
                                start: prev.preview.startMin,
                                end: prev.preview.endMin,
                              });
                            }
                          }
                          return null;
                        });
                      },
                      onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => {
                        setCalendarDrag((prev) => {
                          if (!prev || e.pointerId !== prev.pointerId) return prev;
                          try {
                            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                          } catch {
                            /* noop */
                          }
                          return null;
                        });
                      },
                    };

                    if (isCrosslistGroupEvent(event) && event.crosslistGroupId && event.crosslistMembers) {
                      return (
                        <CrosslistCalendarEventCard
                          key={getCalendarEventKey(event, room.id)}
                          crosslistGroupId={event.crosslistGroupId}
                          members={event.crosslistMembers}
                          timeLabel={timeLabel}
                          color={color}
                          matchesHoveredDepartment={matchesHoveredDepartment}
                          isDragSource={isDragSource}
                          hasDragMoved={Boolean(calendarDrag?.hasMoved)}
                          placementLocked={placementLocked}
                          draggable={Boolean(solverInput)}
                          lockable={Boolean(solverInput)}
                          isStaggered={sectionIsStaggered(section.id)}
                          onToggleLock={() => requestToggleLockFromCalendar(section.id)}
                          isConflicting={event.crosslistMembers.some((member) =>
                            conflictSectionIds.has(member.id),
                          )}
                          style={{
                            left: `${leftPct * 100}%`,
                            width: `${Math.max(widthPct * 100, 0.5)}%`,
                            top,
                            height: EVENT_HEIGHT_PX,
                          }}
                          instructorById={instructorById}
                          {...sharedPointerHandlers}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (suppressCardClickRef.current) {
                              suppressCardClickRef.current = false;
                              return;
                            }
                            openCrosslistGroupPicker(event.crosslistGroupId!, event.crosslistMembers!);
                          }}
                        />
                      );
                    }

                    const inst = instructorById.get(section.instructor_id);
                    const professor = inst?.name ?? section.instructor_id ?? "—";
                    const title = section.department + " " + section.course_id;
                    const isConflicting = conflictSectionIds.has(section.id);
                    const isStaggered = sectionIsStaggered(section.id);

                    return (
                      <div
                        key={getCalendarEventKey(event, room.id)}
                        className={clsx(
                          "group absolute border-l-4 rounded-lg p-2.5 flex flex-col justify-between z-10 shadow-sm select-none",
                          solverInput && "cursor-grab touch-none active:cursor-grabbing",
                          !isDragSource && "hover:shadow-md",
                          isDragSource &&
                            calendarDrag?.hasMoved &&
                            "opacity-[0.12] pointer-events-none",
                          !matchesHoveredDepartment && "opacity-35",
                          activeLegendDepartmentKeys.size > 0 &&
                            matchesHoveredDepartment &&
                            "ring-2 ring-slate-300/80 shadow-md",
                          isStaggered &&
                            !isConflicting &&
                            "ring-1 ring-inset ring-indigo-400/70",
                          isConflicting &&
                            "ring-2 ring-red-500 ring-offset-1 z-20 shadow-md",
                        )}
                        style={{
                          left: `${leftPct * 100}%`,
                          width: `${Math.max(widthPct * 100, 0.5)}%`,
                          top,
                          height: EVENT_HEIGHT_PX,
                          backgroundColor: color.cardBg,
                          backgroundImage: color.cardPattern,
                          borderLeftColor: color.cardBorder,
                        }}
                        title={`${title} • ${professor} • ${timeLabel} • Room ${room.id}`}
                        {...sharedPointerHandlers}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (suppressCardClickRef.current) {
                            suppressCardClickRef.current = false;
                            return;
                          }
                          setSectionModalError(null);
                          setSectionModal({
                            mode: "edit",
                            initialSectionId: section.id,
                            draft: toSectionFormDraft(section),
                          });
                        }}
                      >
                        <div className="absolute right-1 top-1 z-[3] flex items-center gap-1">
                          {isStaggered && (
                            <Shuffle
                              className="pointer-events-none size-3.5 text-indigo-600 drop-shadow-sm"
                              aria-label="Staggered across days"
                            />
                          )}
                          {solverInput && (
                            <button
                              type="button"
                              className={clsx(
                                "flex size-5 shrink-0 items-center justify-center rounded-md border shadow-sm transition-opacity",
                                placementLocked
                                  ? "border-amber-300 bg-amber-50 text-amber-900 opacity-100"
                                  : "border-slate-300 bg-white/90 text-slate-600 opacity-0 hover:bg-white focus-visible:opacity-100 group-hover:opacity-100",
                              )}
                              title={
                                placementLocked
                                  ? "Locked for solver — click to unlock (all pattern days)"
                                  : "Lock for solver (locks every day in the pattern)"
                              }
                              aria-label={placementLocked ? "Unlock placement" : "Lock placement"}
                              onPointerDown={(e) => e.stopPropagation()}
                              onPointerUp={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                requestToggleLockFromCalendar(section.id);
                              }}
                            >
                              {placementLocked ? (
                                <Lock className="size-3" />
                              ) : (
                                <Unlock className="size-3" />
                              )}
                            </button>
                          )}
                        </div>
                        <div className="font-black text-[10px] truncate text-slate-900 pr-9">
                          {title}
                        </div>
                        <div className="text-[9px] font-bold leading-tight text-slate-700">
                          <div className="truncate">{professor}</div>
                          <div className="text-[8px] leading-snug truncate">{timeLabel}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {calendarDrag?.hasMoved &&
                calendarDrag &&
                data &&
                (() => {
                  const d = calendarDrag;
                  const ix = roomRows.findIndex((rr) => rr.room.id === d.preview.targetRoomId);
                  if (ix < 0) return null;
                  let topPx = 0;
                  for (let i = 0; i < ix; i += 1) topPx += roomRows[i].rowHeight;
                  topPx +=
                    EVENT_TOP_PADDING_PX + d.originLane * (EVENT_HEIGHT_PX + EVENT_GAP_PX);
                  const leftPct = ((d.preview.startMin - axisStart) / axisRange) * 100;
                  const widthPct =
                    ((d.preview.endMin - d.preview.startMin) / axisRange) * 100;
                  const st = timeslotById.get(d.preview.slotId);
                  const section = data.sections.find((s) => s.id === d.sectionId);
                  if (!section || !st) return null;
                  const instPv = instructorById.get(section.instructor_id);
                  const professorPv = instPv?.name ?? section.instructor_id ?? "—";
                  const draggedEvent = findCalendarEventBySectionId(allDayEvents, d.sectionId);
                  const ttlPv =
                    draggedEvent && isCrosslistGroupEvent(draggedEvent)
                      ? draggedEvent.crosslistGroupId
                      : `${section.department} ${section.course_id}`;
                  const timeLabelPv = `${formatTimeAmPm(st.start_time)} - ${formatTimeAmPm(st.end_time)}`;
                  const colorPv =
                    departmentPaletteByKey.get(departmentColorKey(section)) ?? solidPaletteAt(0);
                  const previewBlocked = dragBlockedTimeslotInfo.blockedSlotIds.has(
                    `${d.preview.targetRoomId}::${st.id}`,
                  );
                  const previewMatchesHoveredDepartment =
                    activeLegendDepartmentKeys.size === 0 ||
                    activeLegendDepartmentKeys.has(departmentColorKey(section));
                  return (
                    <div
                      key="calendar-drag-preview"
                      className={clsx(
                        "absolute pointer-events-none z-[25] border-l-4 rounded-lg p-2.5 flex flex-col justify-between shadow-sm ring-2 ring-inset",
                        previewBlocked ? "ring-red-500/65" : "ring-[#137fec]/40",
                        !previewMatchesHoveredDepartment && "opacity-35",
                      )}
                      style={{
                        left: `${leftPct}%`,
                        width: `${Math.max(widthPct, 0.5)}%`,
                        top: topPx,
                        height: EVENT_HEIGHT_PX,
                        backgroundColor: colorPv.cardBg,
                        backgroundImage: colorPv.cardPattern,
                        borderLeftColor: colorPv.cardBorder,
                      }}
                    >
                      <div className="font-black text-[10px] truncate text-slate-900">{ttlPv}</div>
                      <div className="text-[9px] font-bold leading-tight text-slate-700">
                        <div className="truncate">{professorPv}</div>
                        <div className="text-[8px] leading-snug truncate">{timeLabelPv}</div>
                      </div>
                    </div>
                  );
                })()}

              {dayEvents.length === 0 && (
                <div className="flex min-h-[180px] items-center justify-center text-slate-400 text-sm font-medium">
                  No sections scheduled for {selectedDay}.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {drawerRender &&
        dragFeedbackToastMount &&
        createPortal(
          <>
        <div
          className={clsx(
            "fixed inset-x-0 bottom-0 top-16 z-40 bg-slate-900/40 transition-opacity duration-300 ease-out",
            drawerEntered ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setScheduleDrawerOpen(false)}
          aria-hidden
        />
      <aside
        className={clsx(
          "fixed top-16 right-0 z-40 h-[calc(100dvh-4rem)] w-full max-w-[720px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out will-change-transform",
          drawerEntered ? "translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-label="Schedule table"
        aria-hidden={!drawerEntered}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && !scheduleDrawerOpen) {
            setDrawerRender(false);
          }
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">Schedule table</h3>
            <p className="text-[11px] text-slate-500 truncate">
              Lock keeps a section on its current room and times when you run the solver. Cross-listed sections lock as a group.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setScheduleDrawerOpen(false)}
            className="flex items-center justify-center rounded-lg size-8 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors shrink-0"
            aria-label="Close schedule table"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="border-b border-slate-200 px-4 py-2 bg-slate-50">
          <div className="relative mb-2">
            <Filter className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="text"
              value={drawerSearch}
              onChange={(e) => setDrawerSearch(e.target.value)}
              placeholder="Search by section, course, room, instructor…"
              className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-weatherhead-primary/20"
              aria-label="Search sections"
            />
            {drawerSearch ? (
              <button
                type="button"
                onClick={() => setDrawerSearch("")}
                className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {drawerSectionsSearched.length} section{drawerSectionsSearched.length === 1 ? "" : "s"}
            {drawerSearch ? (
              <span className="text-slate-400"> of {tableSectionsFiltered.length}</span>
            ) : null}
          </span>
          {hasAnyPlacementLock && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800">
              · {lockedSectionIds.length} locked
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={lockAllPlacementChanges}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors"
              title="Hard-lock every section whose placement differs from the saved baseline (needs room + times)"
            >
              <Lock className="size-3.5" />
              Lock all changes
            </button>
            <button
              type="button"
              disabled={!hasAnyPlacementLock}
              onClick={unlockAllPlacementLocks}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors",
                hasAnyPlacementLock
                  ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed",
              )}
              title="Remove all placement locks added from this calendar view"
            >
              <Unlock className="size-3.5" />
              Unlock all
            </button>
          </div>
          </div>
        </div>
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-[1] bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Section</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Timeslots</th>
                <th className="px-4 py-3 text-center">Lock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drawerSectionsSearched.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                    No sections match “{drawerSearch}”.
                  </td>
                </tr>
              ) : null}
              {drawerSectionsSearched.map((section) => {
                const a = normalizeAssignmentMapEntry(section, assignmentsBySection);
                const locked = isPlacementLocked(section.id);
                const canLock = canLockSectionPlacement(section.id);
                const peerCount = crosslistPeerSectionIds(section.id, data.sections).length;
                const slotLabels = a.timeslot_ids
                  .map((id) => {
                    const slot = timeslotById.get(id);
                    if (!slot) return id;
                    const day = (slot.days ?? slot.day ?? "").toString().trim();
                    return `${day} ${formatTimeAmPm(slot.start_time)}–${formatTimeAmPm(slot.end_time)}`;
                  })
                  .join("; ");
                return (
                  <tr key={section.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                      {section.id}
                      {peerCount > 1 ? (
                        <span className="ml-1 text-[10px] font-normal text-slate-500">(xlist)</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {[section.department, String(section.course_id)].filter(Boolean).join(" ")}
                      {section.section_code ? ` · ${section.section_code}` : ""}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{a.room_id || "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-md">{slotLabels || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        disabled={!locked && !canLock}
                        onClick={() => togglePlacementLockForSection(section.id)}
                        className={clsx(
                          "inline-flex items-center justify-center rounded-lg border p-2 transition-colors",
                          locked
                            ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                            : canLock
                              ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300",
                        )}
                        title={
                          locked
                            ? "Unlock for solver (cross-listed peers unlock together)"
                            : canLock
                              ? "Lock current room and times for solver"
                              : "Set room and times before locking"
                        }
                        aria-label={locked ? "Unlock placement" : "Lock placement"}
                      >
                        {locked ? <Lock className="size-4" /> : <Unlock className="size-4 opacity-40" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </aside>
          </>,
          dragFeedbackToastMount,
        )}

      {calendarContextMenu &&
        dragFeedbackToastMount &&
        createPortal(
          <div
            role="menu"
            className="fixed z-[60] min-w-[220px] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl"
            style={{
              left: Math.min(
                calendarContextMenu.clientX,
                (typeof window !== "undefined" ? window.innerWidth : 800) - 240,
              ),
              top: Math.min(
                calendarContextMenu.clientY,
                (typeof window !== "undefined" ? window.innerHeight : 600) - 120,
              ),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={
                !isPlacementLocked(calendarContextMenu.sectionId) &&
                !canLockSectionPlacement(calendarContextMenu.sectionId)
              }
              onClick={() => togglePlacementLockForSection(calendarContextMenu.sectionId)}
            >
              {isPlacementLocked(calendarContextMenu.sectionId) ? (
                <>
                  <Unlock className="size-4 shrink-0" aria-hidden />
                  Unlock placement for solver
                </>
              ) : (
                <>
                  <Lock className="size-4 shrink-0" aria-hidden />
                  Lock placement for solver
                </>
              )}
            </button>
            {data &&
            crosslistPeerSectionIds(calendarContextMenu.sectionId, data.sections).length > 1 ? (
              <p className="border-t border-slate-100 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
                Cross-listed: this applies to every section in the group.
              </p>
            ) : null}
          </div>,
          dragFeedbackToastMount,
        )}

      <ViewportModal
        isOpen={saveScheduleModal.isOpen}
        onClose={() => {
          if (saveScheduleModal.isSaving) return;
          closeSaveScheduleModal();
        }}
        zIndex={1000}
      >
        {saveScheduleModal.isOpen ? (
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-black text-slate-900">Save Schedule</h3>
              <button
                type="button"
                disabled={saveScheduleModal.isSaving}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                onClick={closeSaveScheduleModal}
              >
                Close
              </button>
            </div>
            <div className="space-y-4 px-6 py-5 text-sm">
              <p className="text-xs text-slate-500">
                Save this generated/edited schedule so you can reload, export, or branch it later.
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-600">Schedule name *</span>
                <input
                  className="rounded-lg border border-slate-200 px-3 py-2"
                  value={saveScheduleModal.draft.name}
                  onChange={(e) => updateSaveScheduleDraft({ name: e.target.value })}
                  disabled={saveScheduleModal.isSaving}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-600">Schedule date *</span>
                <input
                  type="date"
                  className="rounded-lg border border-slate-200 px-3 py-2"
                  value={saveScheduleModal.draft.scheduleDate}
                  onChange={(e) => updateSaveScheduleDraft({ scheduleDate: e.target.value })}
                  disabled={saveScheduleModal.isSaving}
                />
              </label>
              {saveScheduleModal.error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {saveScheduleModal.error}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={saveScheduleModal.isSaving}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  onClick={closeSaveScheduleModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saveScheduleModal.isSaving}
                  className={clsx(
                    "rounded-lg px-3 py-2 text-sm font-bold text-white",
                    saveScheduleModal.isSaving ? "bg-slate-400" : "bg-[#137fec] hover:bg-[#0f6dca]",
                  )}
                  onClick={() => void handleSaveScheduleToHistory()}
                >
                  {saveScheduleModal.isSaving ? "Saving..." : "Save to History"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </ViewportModal>

      <ViewportModal
        isOpen={Boolean(runSolverPrompt)}
        onClose={() => setRunSolverPrompt(null)}
        zIndex={1000}
      >
        {runSolverPrompt ? (
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="run-solver-prompt-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 id="run-solver-prompt-title" className="text-lg font-black text-slate-900">
                Run the solver?
              </h3>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                onClick={() => setRunSolverPrompt(null)}
              >
                Close
              </button>
            </div>
            <div className="space-y-4 px-6 py-5 text-sm text-slate-700">
              <p>
                The current schedule on your calendar{" "}
                <span className="font-semibold">hasn&apos;t been saved to History.</span> Running
                the solver will re-optimize the schedule and replace it —{" "}
                <span className="font-semibold">for everyone viewing the calendar.</span>
              </p>
              <p className="text-slate-500">
                Save it to History first if you want to keep this version to reload or compare
                later.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  onClick={() => setRunSolverPrompt(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-800 hover:bg-indigo-100"
                  onClick={() => {
                    setRunSolverPrompt(null);
                    openSaveScheduleModal();
                  }}
                >
                  Save to History
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-[#137fec] px-3 py-2 text-sm font-bold text-white hover:bg-[#0f6dca]"
                  onClick={() => {
                    setRunSolverPrompt(null);
                    void runSolverNow();
                  }}
                >
                  Run without saving
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </ViewportModal>

      <ViewportModal
        isOpen={Boolean(crosslistPickerModal)}
        onClose={() => setCrosslistPickerModal(null)}
        zIndex={1000}
      >
        {crosslistPickerModal ? (
          <div
            className="flex max-h-[min(85vh,640px)] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crosslist-picker-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3
                  id="crosslist-picker-modal-title"
                  className="text-lg font-black text-slate-900"
                >
                  Cross-list {crosslistPickerModal.crosslistGroupId}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {crosslistPickerModal.memberSections.length} courses linked. Select a section to
                  view or edit its details.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                onClick={() => setCrosslistPickerModal(null)}
              >
                Close
              </button>
            </div>
            {data && (
              <CrosslistScheduleBanner
                members={crosslistPickerModal.memberSections}
                assignmentsBySection={assignmentsBySection}
                solverTimeslotIdsBySection={solverTimeslotIdsBySection}
                timeslotById={timeslotById}
                rooms={data.rooms}
              />
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-2">
              {crosslistPickerModal.memberSections.map((member) => {
                const professor =
                  instructorById.get(member.instructor_id)?.name?.trim() ||
                  member.instructor_id ||
                  "—";
                const courseLine = [
                  (member.department ?? "").toString().trim(),
                  String(member.course_id),
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={member.id}
                    type="button"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:border-violet-300 hover:bg-violet-50/60 transition-colors"
                    onClick={() =>
                      openSectionEditorFromCrosslist(
                        member,
                        crosslistPickerModal.crosslistGroupId,
                      )
                    }
                  >
                    <div className="font-bold text-sm text-slate-900">{courseLine}</div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      Section {member.section_code} · {member.id}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{professor}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </ViewportModal>

      <ViewportModal
        isOpen={Boolean(sectionModal)}
        onClose={() => {
          if (isSavingSection) return;
          setSectionModal(null);
          setSectionModalError(null);
        }}
        zIndex={1000}
      >
        {sectionModal ? (
          <div
            className="flex max-h-[min(85vh,720px)] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="section-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex min-w-0 items-center gap-3">
                {sectionModal.returnToCrosslistGroupId && (
                  <button
                    type="button"
                    disabled={isSavingSection}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                    onClick={returnToCrosslistPickerFromSectionModal}
                  >
                    <ArrowLeft className="size-4" />
                    Back
                  </button>
                )}
                <h3 id="section-modal-title" className="truncate text-lg font-black text-slate-900">
                  {sectionModal.mode === "create" ? "Add Section" : "Edit Section"}
                </h3>
              </div>
              <button
                type="button"
                disabled={isSavingSection}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  setSectionModal(null);
                  setSectionModalError(null);
                }}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto space-y-4 px-6 py-5 text-sm">
              {sectionModal.mode === "create" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Rooms and timeslots are assigned directly on the calendar. After creating this
                  section, hover over an available room/time space and click to place it.
                </div>
              )}
              {sectionModal.mode === "edit" && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  Assigned meeting pattern:{" "}
                  <span className="font-semibold">
                    {(() => {
                      const sectionId = sectionModal.initialSectionId ?? "";
                      const assignmentPattern = assignmentsBySection[sectionId]?.meeting_pattern_id;
                      const persistedPattern = data.sections.find((s) => s.id === sectionId)?.previous_meeting_pattern;
                      return assignmentPattern || persistedPattern || "None";
                    })()}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">Section ID *</span>
                  <input
                    className="rounded-lg border border-slate-200 px-3 py-2"
                    value={sectionModal.draft.id}
                    onChange={(e) => updateSectionModalDraft("id", e.target.value)}
                    disabled={sectionModal.mode === "edit" || isSavingSection}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">Department</span>
                  <input
                    className="rounded-lg border border-slate-200 px-3 py-2"
                    value={sectionModal.draft.department}
                    onChange={(e) => updateSectionModalDraft("department", e.target.value)}
                    disabled={isSavingSection}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">Course ID *</span>
                  <input
                    className="rounded-lg border border-slate-200 px-3 py-2"
                    value={sectionModal.draft.course_id}
                    onChange={(e) => updateSectionModalDraft("course_id", e.target.value)}
                    disabled={isSavingSection}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">Section Code *</span>
                  <input
                    className="rounded-lg border border-slate-200 px-3 py-2"
                    value={sectionModal.draft.section_code}
                    onChange={(e) => updateSectionModalDraft("section_code", e.target.value)}
                    disabled={isSavingSection}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">Instructor *</span>
                  <select
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                    value={sectionModal.draft.instructor_id}
                    onChange={(e) => updateSectionModalDraft("instructor_id", e.target.value)}
                    disabled={isSavingSection}
                  >
                    <option value="">Select instructor</option>
                    {data.instructors.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name?.trim() || inst.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">Expected Enrollment *</span>
                  <input
                    type="number"
                    min={0}
                    className="rounded-lg border border-slate-200 px-3 py-2"
                    value={sectionModal.draft.expected_enrollment}
                    onChange={(e) =>
                      updateSectionModalDraft("expected_enrollment", Number(e.target.value))
                    }
                    disabled={isSavingSection}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">Enrollment Cap *</span>
                  <input
                    type="number"
                    min={0}
                    className="rounded-lg border border-slate-200 px-3 py-2"
                    value={sectionModal.draft.enrollment_cap}
                    onChange={(e) => updateSectionModalDraft("enrollment_cap", Number(e.target.value))}
                    disabled={isSavingSection}
                  />
                </label>
                {sectionModal.mode === "edit" ? (
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-xs font-semibold text-slate-600">
                      Allowed Meeting Patterns (comma-separated)
                    </span>
                    <input
                      className="rounded-lg border border-slate-200 px-3 py-2"
                      value={sectionModal.draft.allowed_meeting_patterns}
                      onChange={(e) => updateSectionModalDraft("allowed_meeting_patterns", e.target.value)}
                      disabled={isSavingSection}
                    />
                  </label>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:col-span-2">
                    Meeting pattern selection happens after you place the new section on the calendar.
                  </div>
                )}
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-xs font-semibold text-slate-600">Room Requirements (comma-separated)</span>
                  <input
                    className="rounded-lg border border-slate-200 px-3 py-2"
                    value={sectionModal.draft.room_requirements}
                    onChange={(e) => updateSectionModalDraft("room_requirements", e.target.value)}
                    disabled={isSavingSection}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">Crosslist Group ID</span>
                  <input
                    className="rounded-lg border border-slate-200 px-3 py-2"
                    value={sectionModal.draft.crosslist_group_id}
                    onChange={(e) => updateSectionModalDraft("crosslist_group_id", e.target.value)}
                    disabled={isSavingSection}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">Tags (comma-separated)</span>
                  <input
                    className="rounded-lg border border-slate-200 px-3 py-2"
                    value={sectionModal.draft.tags}
                    onChange={(e) => updateSectionModalDraft("tags", e.target.value)}
                    disabled={isSavingSection}
                  />
                </label>
              </div>
              {sectionModalError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {sectionModalError}
                </div>
              )}
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                disabled={isSavingSection}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setSectionModal(null);
                  setSectionModalError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingSection}
                className={clsx(
                  "rounded-lg px-3 py-2 text-sm font-bold text-white",
                  isSavingSection ? "bg-slate-400" : "bg-[#137fec] hover:bg-[#0f6dca]",
                )}
                onClick={handleSaveSectionModal}
              >
                {isSavingSection ? "Saving..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        ) : null}
      </ViewportModal>

      <ViewportModal
        isOpen={Boolean(meetingPatternSelectionModal)}
        onClose={dismissMeetingPatternSelection}
        zIndex={1000}
      >
        {meetingPatternSelectionModal ? (
          <div
            className="flex max-h-[min(85vh,640px)] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-pattern-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 id="meeting-pattern-modal-title" className="text-lg font-black text-slate-900">
                Select Meeting Pattern
              </h3>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                onClick={dismissMeetingPatternSelection}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto space-y-4 px-6 py-5 text-sm">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Section is placed at room{" "}
                <span className="font-semibold">{meetingPatternSelectionModal.roomId}</span>. Choose a
                meeting pattern that includes this placed timeslot and maps the section to its
                additional days.
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-600">
                  Compatible Meeting Pattern Options
                </span>
                <select
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                  value={meetingPatternSelectionModal.selectedOptionKey}
                  onChange={(e) =>
                    setMeetingPatternSelectionModal((prev) =>
                      prev ? { ...prev, selectedOptionKey: e.target.value } : prev,
                    )
                  }
                >
                  {meetingPatternSelectionModal.options.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {meetingPatternSelectionError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {meetingPatternSelectionError}
                </div>
              )}
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                onClick={dismissMeetingPatternSelection}
              >
                Later
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#137fec] px-3 py-2 text-sm font-bold text-white hover:bg-[#0f6dca]"
                onClick={applyMeetingPatternSelection}
              >
                Apply Pattern
              </button>
            </div>
          </div>
        ) : null}
      </ViewportModal>

      <ViewportModal
        isOpen={Boolean(patternApplyModal)}
        onClose={dismissPatternApplyModal}
        zIndex={1000}
      >
        {patternApplyModal ? (
          (() => {
            const applicableRows = patternApplyModal.rows.filter(
              (row) => row.severity === "ok" || row.severity === "warn",
            );
            const selectedCount = applicableRows.filter((row) => row.selected).length;
            return (
              <div
                className="flex max-h-[min(85vh,640px)] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pattern-apply-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
                  <h3
                    id="pattern-apply-modal-title"
                    className="text-lg font-black text-slate-900"
                  >
                    Apply time across pattern
                  </h3>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                    onClick={dismissPatternApplyModal}
                  >
                    Close
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto space-y-4 px-6 py-5 text-sm">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    You moved{" "}
                    <span className="font-semibold">{patternApplyModal.courseLabel}</span> to{" "}
                    <span className="font-semibold">{patternApplyModal.anchorTimeLabel}</span> on{" "}
                    <span className="font-semibold">{patternApplyModal.anchorDay}</span> in room{" "}
                    <span className="font-semibold">{patternApplyModal.roomId}</span>. Choose which of
                    its other pattern days should move to the same time. Clean days are pre-selected;
                    days with a conflict or no matching timeslot are called out below.
                  </div>
                  <ul className="space-y-2">
                    {patternApplyModal.rows.map((row) => {
                      const disabled = row.severity === "block" || row.severity === "none";
                      const badge =
                        row.severity === "ok"
                          ? { text: "Available", cls: "bg-emerald-100 text-emerald-800" }
                          : row.severity === "warn"
                            ? { text: "Conflict", cls: "bg-amber-100 text-amber-900" }
                            : row.severity === "block"
                              ? { text: "Blocked", cls: "bg-rose-100 text-rose-700" }
                              : { text: "No slot", cls: "bg-slate-200 text-slate-600" };
                      return (
                        <li
                          key={row.day}
                          className={clsx(
                            "flex items-start gap-3 rounded-lg border px-3 py-2.5",
                            disabled
                              ? "border-slate-200 bg-slate-50 opacity-80"
                              : "border-slate-200 bg-white",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 shrink-0 accent-[#137fec] disabled:cursor-not-allowed"
                            checked={row.selected && !disabled}
                            disabled={disabled}
                            onChange={() => togglePatternApplyRow(row.day)}
                            aria-label={`Apply to ${row.day}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">{row.day}</span>
                              <span className="text-xs text-slate-500">{row.timeLabel}</span>
                              <span
                                className={clsx(
                                  "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                                  badge.cls,
                                )}
                              >
                                {badge.text}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs leading-snug text-slate-600">
                              {row.message}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-6 py-4">
                  <span className="text-xs text-slate-500">
                    {selectedCount} of {applicableRows.length} available day
                    {applicableRows.length === 1 ? "" : "s"} selected
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                      onClick={dismissPatternApplyModal}
                    >
                      Keep staggered
                    </button>
                    <button
                      type="button"
                      className="rounded-lg bg-[#137fec] px-3 py-2 text-sm font-bold text-white hover:bg-[#0f6dca] disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={applyPatternDays}
                      disabled={selectedCount === 0}
                    >
                      Apply to selected day{selectedCount === 1 ? "" : "s"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()
        ) : null}
      </ViewportModal>

      <ViewportModal
        isOpen={Boolean(staggeredLockConfirm)}
        onClose={() => setStaggeredLockConfirm(null)}
        zIndex={1000}
      >
        {staggeredLockConfirm ? (
          <div
            className="flex w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staggered-lock-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-6 py-4">
              <Shuffle className="size-5 shrink-0 text-indigo-600" aria-hidden />
              <h3 id="staggered-lock-modal-title" className="text-lg font-black text-slate-900">
                Lock a staggered section?
              </h3>
            </div>
            <div className="space-y-4 px-6 py-5 text-sm">
              <p className="text-slate-700">
                <span className="font-semibold">{staggeredLockConfirm.courseLabel}</span> meets at{" "}
                different times across its days. Locking pins{" "}
                <span className="font-semibold">every day</span> at its current room and time for the
                solver. Double-check the times below before locking.
              </p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {staggeredLockConfirm.dayTimes.map((entry) => (
                  <li
                    key={entry.day}
                    className="flex items-center justify-between px-3 py-2 text-xs"
                  >
                    <span className="font-semibold text-slate-900">{entry.day}</span>
                    <span className="text-slate-600">{entry.timeLabel}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500">
                Want them consistent instead? Cancel, then use “Apply to all pattern days” after
                moving one day to line up the times first.
              </p>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                onClick={() => setStaggeredLockConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-white hover:bg-amber-600"
                onClick={confirmStaggeredLock}
              >
                <Lock className="size-4" aria-hidden />
                Lock all days
              </button>
            </div>
          </div>
        ) : null}
      </ViewportModal>

      <div className="hidden print:block print-calendar">
        {DAYS.map((day) => {
          const printRows = getRoomRowsForDay(day);
          const printRowsWithEvents = printRows.filter((row) => row.events.length > 0);
          return (
            <div key={`print-${day}`} className="print-page">
              <h2 className="text-xl font-bold mb-1">Schedule Output Calendar - {day}</h2>
              {printPdfFilterLines.length > 0 && (
                <div className="text-sm text-slate-700 mb-3 space-y-0.5">
                  {printPdfFilterLines.map((line) => (
                    <div key={`${day}-${line.key}`}>
                      <span className="font-semibold">{line.label}: </span>
                      {line.value}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-600 mb-3">
                Sections are listed by room with full course titles and instructor names. Times are the
                scheduled start and end for {day}.
              </p>
              {printRowsWithEvents.length === 0 ? (
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
                  No sections scheduled for this day (with the current filters).
                </div>
              ) : (
                <div className="border border-slate-300 rounded-sm overflow-hidden">
                  {printRowsWithEvents.map(({ room, events }) => {
                    const sorted = [...events].sort(
                      (a, b) => a.start - b.start || a.lane - b.lane,
                    );
                    const roomTitle =
                      [room.building, formatRoomNumberForDisplay(room.room_number)]
                        .filter(Boolean)
                        .join(" ") || room.id;
                    const renderEventRow = (
                      event: (typeof sorted)[0],
                      eventKey: string,
                    ) => {
                      const { section, start, end } = event;
                      const color =
                        departmentPaletteByKey.get(departmentColorKey(section)) ?? solidPaletteAt(0);

                      if (isCrosslistGroupEvent(event) && event.crosslistGroupId && event.crosslistMembers) {
                        return (
                          <div
                            key={eventKey}
                            className="print-event-item flex gap-3 border-b border-slate-200 px-3 py-2.5 text-sm last:border-b-0"
                            style={{
                              borderLeftWidth: 4,
                              borderLeftStyle: "solid",
                              borderLeftColor: color.printBorder,
                              backgroundColor: color.printBg,
                            }}
                          >
                            <div className="w-40 shrink-0 text-xs font-semibold leading-snug text-slate-900">
                              {formatScheduleTimeRange(start, end)}
                            </div>
                            <div className="min-w-0 flex-1 leading-snug">
                              <div className="font-bold text-slate-900 break-words">
                                Cross-list {event.crosslistGroupId}
                              </div>
                              <ul className="mt-1 list-disc pl-4 text-slate-800 space-y-0.5">
                                {event.crosslistMembers.map((member) => {
                                  const professorName =
                                    instructorById.get(member.instructor_id)?.name?.trim() ||
                                    member.instructor_id;
                                  const dept = (member.department ?? "").toString().trim();
                                  const courseLine = [dept, String(member.course_id)]
                                    .filter(Boolean)
                                    .join(" ");
                                  const sectionBit = member.section_code
                                    ? ` · Section ${member.section_code}`
                                    : "";
                                  const line = `${courseLine}${sectionBit} (${professorName})`;
                                  return (
                                    <li key={member.id} className="break-words">
                                      {line}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          </div>
                        );
                      }

                      const professorName =
                        instructorById.get(section.instructor_id)?.name?.trim() ||
                        section.instructor_id;
                      const dept = (section.department ?? "").toString().trim();
                      const courseLine = [dept, String(section.course_id)].filter(Boolean).join(" ");
                      const sectionBit = section.section_code
                        ? ` · Section ${section.section_code}`
                        : "";
                      return (
                        <div
                          key={eventKey}
                          className="print-event-item flex gap-3 border-b border-slate-200 px-3 py-2.5 text-sm last:border-b-0"
                          style={{
                            borderLeftWidth: 4,
                            borderLeftStyle: "solid",
                            borderLeftColor: color.printBorder,
                            backgroundColor: color.printBg,
                          }}
                        >
                          <div className="w-40 shrink-0 text-xs font-semibold leading-snug text-slate-900">
                            {formatScheduleTimeRange(start, end)}
                          </div>
                          <div className="min-w-0 flex-1 leading-snug">
                            <div className="font-bold text-slate-900 break-words">
                              {courseLine}
                              {sectionBit}
                            </div>
                            <div className="mt-0.5 text-slate-800 break-words">{professorName}</div>
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div
                        key={`print-room-${day}-${room.id}`}
                        className="print-room-block border-b border-slate-300 last:border-b-0"
                      >
                        <div className="print-room-intro">
                          <div className="print-room-header bg-slate-100 px-3 py-2 text-sm font-bold text-slate-900">
                            {roomTitle}
                            <span className="ml-2 font-normal text-slate-600">
                              · Capacity {room.capacity ?? "N/A"}
                            </span>
                          </div>
                          {renderEventRow(
                            sorted[0],
                            `print-event-${day}-${room.id}-${getCalendarEventKey(sorted[0], room.id)}-0`,
                          )}
                        </div>
                        {sorted.slice(1).map((event, idx) =>
                          renderEventRow(
                            event,
                            `print-event-${day}-${room.id}-${getCalendarEventKey(event, room.id)}-${idx + 1}`,
                          ),
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style jsx global>{`
        @page {
          size: landscape;
          margin: 8mm;
        }
        @media print {
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body * {
            visibility: hidden !important;
          }
          .print-calendar,
          .print-calendar * {
            visibility: visible !important;
          }
          .print-calendar {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
          }
          .print-page {
            page-break-after: always;
            break-after: page;
            padding: 4mm;
          }
          .print-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          /* Keep room title + first section together; avoid slicing a section across pages */
          .print-calendar .print-event-item,
          .print-calendar .print-room-intro,
          .print-calendar .print-room-header {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

    </div>
  );
}


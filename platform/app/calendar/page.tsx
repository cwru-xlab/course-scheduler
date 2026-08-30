"use client";

import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  CloudBackup,
  FileSpreadsheet,
  Filter,
  Table2,
  Link2,
  Lock,
  LockOpen,
  Palette,
  Play,
  Plus,
  Redo2,
  Save,
  Share2,
  Shuffle,
  ArrowUpDown,
  Undo2,
  Unlock,
  X,
  XCircle,
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

import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@heroui/popover";

import { PageHeader } from "@/components/layout/PageHeader";
import { useIslandNotify, useSetStatusBarContent } from "@/components/GlobalStatusBar";
import { MultiSelect } from "@/components/scheduler/MultiSelect";
import { appToolbarShellClass, appNavLinkClass } from "@/lib/ui/appChromeStyles";
import { navbarPopoverProps, toolbarChipPopoverChipClass, toolbarChipPopoverContentClass, toolbarChipPopoverGridClass, toolbarChipPopoverGridStyle, toolbarCompactPopoverContentClass, toolbarFormPopoverContentClass, toolbarPanelCloseOnInteractOutside, useOverlayClampedHeight } from "@/lib/ui/navbarPopoverProps";
import { CompactChipSelect } from "@/components/scheduler/CompactChipSelect";
import { ViewportModal } from "@/components/scheduler/ViewportModal";
import {
  editorToolbarShellClass,
  editorToolbarBtnPrimary,
  editorToolbarBtnSecondary,
  editorToolbarDivider,
  editorFilterClearBtnClass,
} from "@/components/scheduler/editors/editorToolbarStyles";
import { useAuth } from "@/lib/auth-client";
import {
  LAST_SOLVER_RUN_STORAGE_KEY,
  VIEW_FROM_HISTORY_KEY,
  saveScheduleToHistory,
  type LastSolverRunSnapshot,
  isValidLastSolverRunSnapshot,
} from "@/lib/scheduling/history";
import { downloadRoomAssignmentWorkbook } from "@/lib/export/roomAssignmentWorkbook";
import { isPlaceholderInstructor } from "@/lib/scheduling/placeholderInstructor";
import {
  clearEditorInvalidation,
  editorInvalidatedPlacementsToMap,
  mergeEditorSaveIntoCalendar,
  ORPHAN_PENDING_STORAGE_KEY,
  readEditorInvalidatedPlacements,
  readLastSolverRunSnapshot,
  SCHEDULING_SNAPSHOT_MERGED_EVENT,
  setCalendarUnsavedPlacementsFlag,
  type EditorInvalidatedPlacement,
} from "@/lib/scheduling/mergeEditorIntoSnapshot";
import { isOnlineSection, isAssignmentEmpty, isSectionScheduled, normalizeAssignmentRoomId, persistedSectionTimeslotIds, resolveEffectiveAssignment } from "@/lib/scheduling/sectionOnline";
import { normalizeSectionForSave } from "@/lib/scheduling/normalizeSectionForSave";
import { isSectionArchived, normalizeSectionState } from "@/lib/scheduling/sectionState";
import { sectionLocksFromInput } from "@/lib/scheduling/sectionLocks";
import {
  SCHEDULING_WINDOW_END_HOUR,
  SCHEDULING_WINDOW_START_HOUR,
} from "@/lib/scheduling/timeWindow";
import type {
  BlockedTime,
  LockedAssignment,
  ScheduleSolution,
  SchedulingInput,
  SectionLockState,
  SectionState,
  SoftLock,
  ValidationError,
} from "@/lib/scheduling/types";
import { DEFAULT_SOFT_WEIGHT } from "@/lib/scheduling/types";
import type { SchedulingDataRevision } from "@/lib/scheduling/dataRevision";
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
import {
  CALENDAR_ROOM_SORT_OPTIONS,
  canonicalizeRoomNumber,
  DEFAULT_CALENDAR_ROOM_SORT_MODE,
  readCalendarRoomSortMode,
  sortRooms,
  writeCalendarRoomSortMode,
  type CalendarRoomSortMode,
} from "@/lib/scheduling/roomNumber";
import { CrosslistCalendarEventCard, CrosslistLegendSwatch } from "./CrosslistCalendarEventCard";
import { SoloCalendarEventCard } from "./SoloCalendarEventCard";
import { SectionQueueSidebar } from "./SectionQueueSidebar";
import { OrphanSectionsModal } from "./OrphanSectionsModal";
import {
  assignCalendarEventLanes,
  buildPlacementConflictEvents,
  calendarEventInstructorIds,
  calendarEventMatchesFilters,
  calendarEventSectionIds,
  findCalendarEventBySectionId,
  formatCalendarSectionHoverLines,
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
  section_number?: string;
  instructor_id: string;
  timeslot_id?: string | null;
  timeslot_ids?: string[] | null;
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
  features?: string[];
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
  section_number: string;
  instructor_id: string;
  expected_enrollment: number;
  enrollment_cap: number;
  allowed_meeting_patterns: string[];
  room_requirements: string[];
  crosslist_group_id: string;
  tags: string[];
  state: SectionState;
};

type LastSolverRun = LastSolverRunSnapshot;

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

/** Stable signature of the lock map for cheap equality comparisons. */
const locksSignature = (locks: Record<string, SectionLockState>): string =>
  JSON.stringify(
    Object.entries(locks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, state]) => [id, state]),
  );

/** Combined signature of the current working view (assignments + locks). */
const activeViewSignature = (
  map: Record<string, {
    timeslot_ids?: string[];
    room_id?: string | null;
    meeting_pattern_id?: string | null;
  }>,
  locks: Record<string, SectionLockState>,
): string => `${assignmentsSignature(map)}||${locksSignature(locks)}`;

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

function buildLockPayloads(
  sectionLocks: Record<string, SectionLockState>,
  assignments: CalendarAssignmentMap,
  sections: SectionDto[],
): { locked_assignments: LockedAssignment[]; soft_locks: SoftLock[] } {
  const locked: LockedAssignment[] = [];
  const soft: SoftLock[] = [];
  const seenHard = new Set<string>();
  const seenSoft = new Set<string>();

  for (const sectionId of Object.keys(sectionLocks)) {
    const lockState = sectionLocks[sectionId];
    if (lockState === "none") continue;

    const peers = crosslistPeerSectionIds(sectionId, sections);
    const assignment = assignments[sectionId];
    const ts = [...(assignment?.timeslot_ids ?? [])].filter(Boolean).sort();
    const room = (assignment?.room_id ?? "").trim();
    const section = sections.find((s) => s.id === sectionId);
    const online = section ? isOnlineSection(section) : false;
    if (!ts.length) continue;
    if (!online && !room) continue;

    for (const sid of peers) {
      const peerSection = sections.find((s) => s.id === sid);
      const peerOnline = peerSection ? isOnlineSection(peerSection) : online;
      if (lockState === "hard" && !seenHard.has(sid)) {
        seenHard.add(sid);
        if (peerOnline) {
          locked.push({
            section_id: sid,
            fixed_timeslot_set: ts,
          });
        } else if (room) {
          locked.push({
            section_id: sid,
            fixed_timeslot_set: ts,
            fixed_room: room,
          });
        }
      } else if (lockState === "soft" && !seenSoft.has(sid)) {
        seenSoft.add(sid);
        if (peerOnline) {
          soft.push({
            section_id: sid,
            preferred_timeslot_set: ts,
            weight: DEFAULT_SOFT_WEIGHT,
          });
        } else if (room) {
          soft.push({
            section_id: sid,
            preferred_timeslot_set: ts,
            preferred_room: room,
            weight: DEFAULT_SOFT_WEIGHT,
          });
        }
      }
    }
  }
  return { locked_assignments: locked, soft_locks: soft };
}

function mapSolverAssignmentEntry(
  section: Pick<SectionDto, "section_number">,
  assignment: {
    timeslot_ids: string[];
    room_id: string;
    meeting_pattern_id: string;
  },
) {
  return {
    timeslot_ids: assignment.timeslot_ids,
    room_id: normalizeAssignmentRoomId(section, assignment.room_id),
    meeting_pattern_id: assignment.meeting_pattern_id,
  };
}

function normalizeAssignmentMapEntry(
  section: SectionDto,
  assignments: CalendarAssignmentMap,
): { timeslot_ids: string[]; room_id: string; meeting_pattern_id: string } {
  const fromMap = assignments[section.id];
  return {
    timeslot_ids:
      fromMap?.timeslot_ids?.length
        ? fromMap.timeslot_ids
        : persistedSectionTimeslotIds(section),
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
  return canonicalizeRoomNumber(roomNumber);
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Keep archived state when a stale shared snapshot would regress it on remount. */
function preservedArchivedSectionState(
  sectionId: string,
  incomingRaw: string | null | undefined,
  localById?: Record<string, SectionState>,
): SectionState {
  const incoming = normalizeSectionState(incomingRaw ?? "active");
  const local = localById?.[sectionId];
  if (local === "archived" && incoming !== "archived") {
    return "archived";
  }
  if (typeof window === "undefined") return incoming;
  try {
    const raw = localStorage.getItem(LAST_SOLVER_RUN_STORAGE_KEY);
    if (!raw) return incoming;
    const parsed = JSON.parse(raw) as {
      input?: { sections?: { id: string; state?: string | null }[] };
    };
    const stored = parsed.input?.sections?.find((section) => section.id === sectionId);
    if (
      stored &&
      normalizeSectionState(stored.state) === "archived" &&
      incoming !== "archived"
    ) {
      return "archived";
    }
  } catch {
    // Ignore malformed local snapshot payload.
  }
  return incoming;
}

function toSectionFormDraft(section: SectionDto): SectionFormDraft {
  return {
    id: String(section.id ?? "").trim(),
    department: String(section.department ?? "").trim(),
    course_id: String(section.course_id ?? "").trim(),
    section_code: String(section.section_code ?? "").trim(),
    section_number: String(section.section_number ?? "").trim(),
    instructor_id: String(section.instructor_id ?? "").trim(),
    expected_enrollment: Number(section.expected_enrollment ?? 0),
    enrollment_cap: Number(section.enrollment_cap ?? 0),
    allowed_meeting_patterns: [...(section.allowed_meeting_patterns ?? [])],
    room_requirements: section.room_requirements ?? [],
    crosslist_group_id: String(section.crosslist_group_id ?? "").trim(),
    tags: section.tags ?? [],
    state: normalizeSectionState(section.state),
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

function getAllowedSlotDurationsForQueuePlacement(
  sectionId: string,
  data: SolverDataDto,
  solverInput: SchedulingInput | null,
  selectedDay: Day,
  timeslotById: Map<string, TimeslotDto>,
): number[] {
  const section = data.sections.find((entry) => entry.id === sectionId);
  if (!section || !solverInput) return [];

  const allowedPatternSet =
    section.allowed_meeting_patterns && section.allowed_meeting_patterns.length > 0
      ? new Set(section.allowed_meeting_patterns)
      : null;

  const durations = new Set<number>();
  for (const pattern of solverInput.meeting_patterns ?? []) {
    if (allowedPatternSet && !allowedPatternSet.has(pattern.id)) continue;
    if (!meetingPatternIncludesDay(pattern, selectedDay)) continue;
    for (const d of meetingPatternSlotDurationsForDay(pattern, selectedDay, timeslotById)) {
      durations.add(d);
    }
  }
  return Array.from(durations);
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
const QUEUE_SIDEBAR_AUTO_OPEN_EDGE_PX = 120;
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
function computeCalendarDayConflicts(
  events: CalendarEvent[],
  instructorById: Map<string, InstructorDto>,
): {
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
      const sharedInstructor = calendarEventInstructorIds(b).some((id) => {
        if (!instructorsA.has(id)) return false;
        const nameA = instructorById.get(id)?.name;
        const nameB = instructorById.get(id)?.name;
        if (isPlaceholderInstructor(id, nameA) || isPlaceholderInstructor(id, nameB)) {
          return false;
        }
        return true;
      });

      if (!sameRoom && !sharedInstructor) continue;
      if (sameRoom) hasRoomConflict = true;
      if (sharedInstructor) hasInstructorConflict = true;
      for (const id of calendarEventSectionIds(a)) sectionIds.add(id);
      for (const id of calendarEventSectionIds(b)) sectionIds.add(id);
    }
  }

  return { sectionIds, hasRoomConflict, hasInstructorConflict };
}

export default function CalendarPage() {
  type AssignmentMap = CalendarAssignmentMap;

  const router = useRouter();
  const { user } = useAuth();
  const { flash } = useIslandNotify();
  const {
    begin: beginSolverProgress,
    succeed: succeedSolverProgress,
    fail: failSolverProgress,
    cancelRun,
    isRunningLocally,
  } = useSolverProgress();
  const [sectionLocks, setSectionLocks] = useState<Record<string, SectionLockState>>({});
  const [solverRunStatus, setSolverRunStatus] = useState<"idle" | "loading">("idle");
  const solverLock = useSolverLock();
  const isMySolverRun =
    isRunningLocally ||
    (solverLock.active &&
      solverLock.startedByNetworkId !== null &&
      user?.networkId === solverLock.startedByNetworkId);
  const solverBusyRemote = solverLock.active && !isMySolverRun && solverRunStatus !== "loading";
  const { autoSaveEnabled, recordOwnServerWrite } = useSchedulingData();
  const [solverRunError, setSolverRunError] = useState<string | null>(null);
  // Cross-user shared schedule: newest solver result published by any live user.
  const sharedScheduleMeta = useSharedScheduleMeta();
  // Timestamp (ISO) of the schedule currently displayed on screen. Updated by
  // applyRunSnapshot so the header can show accurate metadata even when the
  // displayed schedule differs from the live shared schedule (e.g. loaded from
  // history).
  const displayedScheduleCreatedAtRef = useRef<string | null>(null);
  // Data revision in effect when the displayed schedule was created. Used to
  // show accurate "Data edited" info instead of always using the live server
  // revision. State (not ref) so changes trigger a re-render of the header.
  const [displayedDataRevision, setDisplayedDataRevision] = useState<SchedulingDataRevision | null>(null);
  // Highest shared revision already reflected on this page (applied or authored).
  const appliedSharedRevisionRef = useRef(0);
  // First successful meta poll with revision>0 triggers apply (or banner) once.
  const sharedInitializedRef = useRef(false);
  // True while the current view came from History (protect it from auto-sync).
  const historyViewActiveRef = useRef(false);
  // Live collaboration: debounce timer + signature of the view we last authored
  // or applied, so we only publish genuine local edits as the active schedule.
  const activePublishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePublishInFlightRef = useRef(false);
  const lastActiveSignatureRef = useRef<string | null>(null);
  const updateLastRunStorageRef = useRef<
    ((nextInput: SchedulingInput, assignments: AssignmentMap, locks?: Record<string, SectionLockState>) => void) | null
  >(null);
  // Durable lock persistence: debounce timer + in-flight flag + dirty flag set
  // only by genuine user lock edits (not hydration/apply) so we never
  // re-persist content that arrived from the server or local storage.
  const locksPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locksPersistInFlightRef = useRef(false);
  const locksDirtyRef = useRef(false);
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
    sectionStates?: Record<string, SectionState>;
    // Enriched history: the exact drag toast + conflict rings that were showing
    // for this state, so undo/redo restores them without a re-scan (issue C7).
    // Optional so older snapshots (pushed before enrichment) fall back to the
    // `computeCalendarDayConflicts` rescan path.
    dragFeedback?: CalendarDragFeedbackState;
    conflictSectionIds?: string[];
  };

  const [selectedDay, setSelectedDay] = useState<Day>("Mon");
  const [data, setData] = useState<SolverDataDto | null>(null);
  const sectionStatesRef = useRef<Record<string, SectionState>>({});
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
          sectionStates: data
            ? Object.fromEntries(
                data.sections.map((section) => [
                  section.id,
                  normalizeSectionState(section.state),
                ]),
              )
            : undefined,
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
    [stateKeyForUndo, data],
  );
  // Section ids to visually flag after a placement creates a conflict (instructor
  // double-booking or room overlap) so the user can spot both sides of the clash.
  const [conflictSectionIds, setConflictSectionIds] = useState<Set<string>>(() => new Set());
  // Bumped after undo/redo to request a full day conflict re-scan (no active drag
  // computes conflicts in that case). Paired with a ref so unrelated day/event
  // changes don't trigger the scan.
  const conflictRescanRef = useRef(false);
  const [conflictRescanNonce, setConflictRescanNonce] = useState(0);
  /** Sections auto-unplaced after editor changes invalidated their placement. */
  const [editorInvalidatedPlacements, setEditorInvalidatedPlacements] = useState<
    Map<string, EditorInvalidatedPlacement>
  >(() => editorInvalidatedPlacementsToMap(readEditorInvalidatedPlacements()));
  const [ghostSectionIds, setGhostSectionIds] = useState<Set<string>>(() => new Set());
  const [orphanModalSections, setOrphanModalSections] = useState<SectionDto[]>([]);
  const [queueSidebarOpen, setQueueSidebarOpen] = useState(true);
  const [queueDragSectionId, setQueueDragSectionId] = useState<string | null>(null);
  const [scheduleDrawerOpen, setScheduleDrawerOpen] = useState<boolean>(false);
  const [isExportingRoomAssignments, setIsExportingRoomAssignments] = useState(false);
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
    origin: "grid" | "online";
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
  /** Proposed time (same as the anchor day move). */
  timeLabel: string;
  /** Current time on this day before applying, if any. */
  currentTimeLabel: string | null;
  severity: PatternDayApplySeverity;
  message: string;
  selected: boolean;
};
  const [calendarDrag, setCalendarDrag] = useState<CalendarDragState | null>(null);
  type QueueUnplaceDragState = {
    sectionId: string;
    pointerId: number;
    startX: number;
    startY: number;
    hasMoved: boolean;
    clientX: number;
    clientY: number;
    faceTitle: string;
    professor: string;
    cardBg: string;
    cardBorder: string;
  };
  const [queueUnplaceDrag, setQueueUnplaceDrag] = useState<QueueUnplaceDragState | null>(null);
  const queueSidebarRef = useRef<HTMLDivElement | null>(null);
  const queueSidebarAutoOpenedRef = useRef(false);
  const sidebarUnplaceDropSucceededRef = useRef(false);
  const placementCommittedRef = useRef(false);
  const onlineBandTrackRef = useRef<HTMLDivElement | null>(null);
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
  const [selectedTagKeys, setSelectedTagKeys] = useState<string[]>([]);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const filtersPanelRef = useOverlayClampedHeight<HTMLDivElement>(filtersExpanded);
  const [roomSortExpanded, setRoomSortExpanded] = useState(false);
  const roomSortPanelRef = useOverlayClampedHeight<HTMLDivElement>(roomSortExpanded);
  const activeFilterCount = selectedDepartmentKeys.length + selectedInstructorIds.length + selectedTagKeys.length;
  const [searchQuery, setSearchQuery] = useState("");
  const [roomSortMode, setRoomSortMode] = useState<CalendarRoomSortMode>(
    DEFAULT_CALENDAR_ROOM_SORT_MODE,
  );

  useEffect(() => {
    setRoomSortMode(readCalendarRoomSortMode());
  }, []);

  const [hoveredDepartmentKey, setHoveredDepartmentKey] = useState<string | null>(null);
  const [selectedLegendDepartmentKeys, setSelectedLegendDepartmentKeys] = useState<string[]>([]);
  const [colorsExpanded, setColorsExpanded] = useState(false);
  const [crosslistExpanded, setCrosslistExpanded] = useState(false);
  const colorsGridRef = useOverlayClampedHeight<HTMLDivElement>(colorsExpanded);
  const crosslistGridRef = useOverlayClampedHeight<HTMLDivElement>(crosslistExpanded);
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
    if (!isValidLastSolverRunSnapshot(parsed)) {
      throw new Error("Invalid solver-run snapshot: missing solution.assignments or input.sections.");
    }
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
    const sectionByIdFromSolver = new Map(
      parsed.input.sections.map((section) => [section.id, section]),
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
        mapSolverAssignmentEntry(
          sectionByIdFromSolver.get(assignment.section_id) ?? { section_number: "" },
          assignment,
        ),
      ]),
    );
    for (const section of parsed.input.sections) {
      if (!nextAssignments[section.id]) {
        nextAssignments[section.id] = {
          timeslot_ids: [],
          room_id: "",
          meeting_pattern_id: "",
        };
      }
    }

    const sectionsFromSolver = parsed.input.sections.map((section) => {
      const assignment = assignmentBySectionId.get(section.id);
      return {
        id: section.id,
        course_id: section.course_id,
        department: section.department ?? "",
        section_code: section.section_code,
        section_number: section.section_number ?? "",
        instructor_id: section.instructor_id,
        expected_enrollment: section.expected_enrollment,
        enrollment_cap: section.enrollment_cap,
        allowed_meeting_patterns: section.allowed_meeting_patterns ?? [],
        previous_meeting_pattern:
          assignment?.meeting_pattern_id ?? section.previous_meeting_pattern ?? null,
        room_requirements: section.room_requirements ?? [],
        crosslist_group_id: section.crosslist_group_id ?? null,
        tags: section.tags ?? [],
        state: preservedArchivedSectionState(
          section.id,
          section.state ?? "active",
          sectionStatesRef.current,
        ),
        room_id: normalizeAssignmentRoomId(
          section,
          assignment?.room_id ?? null,
        ) || null,
        // Legacy field retained for compatibility with existing rendering.
        timeslot_id: assignment?.timeslot_ids?.[0] ?? null,
        timeslot_ids: assignment?.timeslot_ids ?? [],
      };
    });

    const timeslotsFromSolver = parsed.input.timeslots.map((timeslot) => ({
      id: timeslot.id,
      day: timeslot.day ?? (timeslot as { days?: string }).days,
      days: (timeslot as { days?: string }).days ?? timeslot.day,
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

    setSolverInput({
      ...parsed.input,
      sections: parsed.input.sections.map((section) => ({
        ...section,
        state: preservedArchivedSectionState(
          section.id,
          section.state ?? "active",
          sectionStatesRef.current,
        ),
      })),
    });
    setAssignmentsBySection(nextAssignments);
    setBaselineAssignments(nextAssignments);
    setSolverTimeslotIdsBySection(allTimeslotIdsBySection);
    if (parsed.sectionLocks) {
      setSectionLocks(parsed.sectionLocks);
    }
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
    // This view is now fully represented server-side (it was just authored or
    // applied), so the live-publish watcher must not echo it back.
    lastActiveSignatureRef.current = activeViewSignature(
      nextAssignments,
      parsed.sectionLocks ?? {},
    );
    displayedScheduleCreatedAtRef.current = parsed.createdAt;
    setDisplayedDataRevision(parsed.dataRevision ?? null);
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
              if (mounted && isValidLastSolverRunSnapshot(parsed)) {
                // Remember which shared revision this local snapshot corresponds
                // to (if it came from a shared run) so we don't re-apply our own.
                if (typeof sessionStorage !== "undefined") {
                  const fromHistory = sessionStorage.getItem(VIEW_FROM_HISTORY_KEY) === "1";
                  historyViewActiveRef.current = fromHistory;
                  sessionStorage.removeItem(VIEW_FROM_HISTORY_KEY);
                }
                applyRunSnapshot(parsed);
                if (historyViewActiveRef.current) {
                  const historySectionById = new Map(
                    parsed.input.sections.map((section) => [section.id, section]),
                  );
                  const sig = assignmentsSignature(
                    Object.fromEntries(
                      parsed.solution.assignments.map((assignment) => [
                        assignment.section_id,
                        mapSolverAssignmentEntry(
                          historySectionById.get(assignment.section_id) ?? {
                            section_number: "",
                          },
                          assignment,
                        ),
                      ]),
                    ),
                  );
                  setLastHistorySavedSignature(sig);
                  setDragFeedback({
                    status: "valid",
                    message: "Saved schedule loaded.",
                  });
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
                timeslot_ids: persistedSectionTimeslotIds(section),
                room_id: section.room_id ?? "",
                meeting_pattern_id: section.previous_meeting_pattern ?? "",
              },
            ]),
          );
          const fallbackSolverTimeslots = Object.fromEntries(
            json.data.sections.map((section) => [
              section.id,
              persistedSectionTimeslotIds(section),
            ]),
          );
          setAssignmentsBySection(fallbackAssignments);
          setBaselineAssignments(fallbackAssignments);
          setSolverTimeslotIdsBySection(fallbackSolverTimeslots);
          const hydratedLocks = sectionLocksFromInput(
            json.data as unknown as {
              locked_assignments?: Array<{ section_id?: string }>;
              soft_locks?: Array<{ section_id?: string }>;
            },
          );
          setSectionLocks(hydratedLocks);
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
    if (!isValidLastSolverRunSnapshot(snapshot)) {
      // Incomplete sync payload (e.g. revision bumped without a full solution).
      // Adopt the revision so we do not retry-crash, but do not wipe the calendar.
      if (typeof full.revision === "number" && full.revision > 0) {
        appliedSharedRevisionRef.current = full.revision;
      }
      return false;
    }
    try {
      applyRunSnapshot(snapshot);
    } catch {
      if (typeof full.revision === "number" && full.revision > 0) {
        appliedSharedRevisionRef.current = full.revision;
      }
      return false;
    }
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

  const hasSearch = searchQuery.trim().length > 0;
  const matchingSectionIds = useMemo(() => {
    if (!hasSearch) return null;
    const q = searchQuery.toLowerCase().trim();
    const matched = new Set<string>();
    for (const section of data?.sections ?? []) {
      const fields = [
        section.id,
        String(section.course_id),
        section.department ?? "",
        section.section_code,
        section.section_number ?? "",
        instructorById.get(section.instructor_id)?.name ?? "",
        section.instructor_id,
      ];
      if (fields.some((f) => f.toLowerCase().includes(q))) {
        matched.add(section.id);
      }
    }
    return matched;
  }, [hasSearch, searchQuery, data?.sections, instructorById]);

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

  const resolveStaggeredPatternPlacement = useCallback(
    (
      sectionId: string,
      targetRoomId: string,
      nextTimeslotIds: string[],
      baseAssignments: AssignmentMap,
      options?: { requireAll?: boolean; anchorSlotId?: string },
    ):
      | { ok: false; message: string }
      | {
          ok: true;
          timeslotIds: string[];
          staggered: boolean;
          skippedDayLabels: string[];
          conflictSectionIds: string[];
          message: string;
        } => {
      if (!data) return { ok: false, message: "Calendar data is unavailable." };
      const anchorSlotId = options?.anchorSlotId;
      const requireAll = options?.requireAll ?? false;
      const linkedSectionIds = crosslistPeerSectionIds(sectionId, data.sections);
      const linkedSectionIdSet = new Set(linkedSectionIds);
      const selectedSlotMap = new Map<string, TimeslotDto>();
      for (const slotId of nextTimeslotIds) {
        const slot = timeslotById.get(slotId);
        if (!slot) return { ok: false, message: `Timeslot '${slotId}' is missing from the calendar.` };
        selectedSlotMap.set(slotId, slot);
      }

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

      const applicable: string[] = [];
      const skippedDayLabels: string[] = [];
      const conflictSectionIds = new Set<string>();

      for (const slotId of nextTimeslotIds) {
        const slot = selectedSlotMap.get(slotId);
        if (!slot) continue;
        const slotWithMinutes: TimeslotWithMinutes = {
          ...slot,
          start: parseMinutes(slot.start_time),
          end: parseMinutes(slot.end_time),
        };
        const daysForSlot = DAYS.filter((day) => timeslotMatchesDay(slot, day));
        const dayLabel =
          daysForSlot.length > 0
            ? daysForSlot.join("/")
            : String(slot.days ?? slot.day ?? selectedDay);

        let blocked = false;
        for (const linkedSectionId of linkedSectionIds) {
          for (const day of daysForSlot.length ? daysForSlot : [selectedDay]) {
            const msg = findBlockedPlacementMessage(
              linkedSectionId,
              targetRoomId,
              slotWithMinutes,
              day,
            );
            if (msg) {
              blocked = true;
              break;
            }
          }
          if (blocked) break;
        }
        if (blocked) {
          skippedDayLabels.push(dayLabel);
          continue;
        }

        let roomConflict = false;
        for (const [otherSectionId, assignment] of Object.entries(baseAssignments)) {
          if (linkedSectionIdSet.has(otherSectionId)) continue;
          const otherRoomId = assignment?.room_id ?? "";
          if (otherRoomId !== targetRoomId) continue;
          const otherSlotIds = assignment?.timeslot_ids ?? [];
          for (const otherSlotId of otherSlotIds) {
            const otherSlot = timeslotById.get(otherSlotId);
            if (!otherSlot) continue;
            if (!slotOverlaps(slot, otherSlot)) continue;
            roomConflict = true;
            conflictSectionIds.add(otherSectionId);
            break;
          }
          if (roomConflict) break;
        }
        if (roomConflict) {
          skippedDayLabels.push(dayLabel);
          continue;
        }

        applicable.push(slotId);
      }

      if (anchorSlotId && !applicable.includes(anchorSlotId)) {
        return {
          ok: false,
          message:
            "Cannot place on the selected day — blocked time or room conflict. Try another room or time.",
        };
      }
      if (!applicable.length) {
        return {
          ok: false,
          message:
            "No days in this meeting pattern could be placed. Try another pattern, room, or time.",
        };
      }
      if (requireAll && applicable.length !== nextTimeslotIds.length) {
        return {
          ok: false,
          message: `Cannot apply this meeting pattern: ${skippedDayLabels.join(", ")} conflict(s). Suggested fix: pick another meeting pattern option or place the section in a different room.`,
        };
      }

      const staggered = applicable.length < nextTimeslotIds.length;
      const message = staggered
        ? `Placed ${applicable.length} of ${nextTimeslotIds.length} pattern days. Skipped (conflict/blocked): ${skippedDayLabels.join(", ")}.`
        : `Applied meeting pattern across ${applicable.length} day(s).`;

      return {
        ok: true,
        timeslotIds: applicable,
        staggered,
        skippedDayLabels,
        conflictSectionIds: Array.from(conflictSectionIds),
        message,
      };
    },
    [data, findBlockedPlacementMessage, selectedDay, timeslotById],
  );

  const validatePatternPlacement = useCallback(
    (
      sectionId: string,
      targetRoomId: string,
      nextTimeslotIds: string[],
      baseAssignments: AssignmentMap,
    ): { ok: true } | { ok: false; message: string } => {
      const resolved = resolveStaggeredPatternPlacement(
        sectionId,
        targetRoomId,
        nextTimeslotIds,
        baseAssignments,
        { requireAll: true },
      );
      if (!resolved.ok) return resolved;
      return { ok: true };
    },
    [resolveStaggeredPatternPlacement],
  );

  const tagFilterOptions = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const s of data.sections) {
      for (const t of s.tags ?? []) {
        if (t.trim()) set.add(t.trim());
      }
    }
    return Array.from(set)
      .sort()
      .map((tag) => ({ key: tag, label: tag }));
  }, [data]);

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

  const featureSuggestions = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const room of data.rooms) {
      for (const f of room.features ?? []) set.add(f);
    }
    for (const s of data.sections) {
      for (const r of s.room_requirements ?? []) set.add(r);
    }
    return Array.from(set).sort();
  }, [data]);

  const tagSuggestions = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const s of data.sections) {
      for (const t of s.tags ?? []) set.add(t);
    }
    return Array.from(set).sort();
  }, [data]);

  const meetingPatternOptions = useMemo(
    () =>
      (solverInput?.meeting_patterns ?? []).map((pattern) => ({
        key: pattern.id,
        label: pattern.id,
      })),
    [solverInput?.meeting_patterns],
  );

  const crosslistGroupOptions = useMemo(
    () =>
      (solverInput?.crosslist_groups ?? []).map((group) => ({
        key: group.id,
        label: group.id,
      })),
    [solverInput?.crosslist_groups],
  );

  const crosslistOptionsWithNone = useMemo(
    () => [{ key: "__none__", label: "(None)" }, ...crosslistGroupOptions],
    [crosslistGroupOptions],
  );

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
        section_number: "",
        instructor_id: "",
        expected_enrollment: 20,
        enrollment_cap: 30,
        allowed_meeting_patterns: [],
        room_requirements: [],
        crosslist_group_id: "",
        tags: [],
        state: "new",
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

  const openSectionEditor = useCallback(
    (sectionId: string) => {
      const section = data?.sections.find((s) => s.id === sectionId);
      if (!section) return;
      setPendingPlacementSectionId(null);
      setQueueDragSectionId(null);
      setPlacementPreview(null);
      setSectionModalError(null);
      setSectionModal({
        mode: "edit",
        initialSectionId: section.id,
        draft: toSectionFormDraft(section),
      });
    },
    [data],
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
      if (!draft.department.trim()) return "SUBJ is required.";
      if (!courseId) return "Course is required.";
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
        section_number: section.section_number ?? "",
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
    (nextAssignments: AssignmentMap, sectionsBase?: SectionDto[]): SectionDto[] => {
      const source = sectionsBase ?? data?.sections;
      if (!source) return [];
      return source.map((section) => {
        const assignment = nextAssignments[section.id];
        if (!assignment || isAssignmentEmpty(assignment)) {
          const preservedPattern =
            String(assignment?.meeting_pattern_id ?? section.previous_meeting_pattern ?? "").trim() ||
            null;
          return {
            ...section,
            room_id: null,
            timeslot_id: null,
            timeslot_ids: [],
            previous_meeting_pattern: preservedPattern,
          };
        }
        const nextMeetingPatternId =
          assignment.meeting_pattern_id || section.previous_meeting_pattern || null;
        const nextAllowedPatterns = Array.from(
          new Set([
            ...(section.allowed_meeting_patterns ?? []),
            ...(nextMeetingPatternId ? [nextMeetingPatternId] : []),
          ]),
        );
        return {
          ...section,
          room_id: normalizeAssignmentRoomId(section, assignment.room_id) || null,
          timeslot_id: assignment.timeslot_ids?.[0] ?? null,
          timeslot_ids: assignment.timeslot_ids ?? [],
          previous_meeting_pattern: nextMeetingPatternId,
          allowed_meeting_patterns: nextAllowedPatterns,
        };
      });
    },
    [data],
  );

  const buildMergedSectionsForSave = useCallback(
    (nextAssignments: AssignmentMap, sectionsBase?: SectionDto[]): SectionDto[] => {
      return mergeSectionsWithAssignments(nextAssignments, sectionsBase).map((section) => {
        const assignment = nextAssignments[section.id];
        if (isSectionScheduled(section, assignment) && isSectionArchived(section)) {
          return { ...section, state: "active" };
        }
        return section;
      });
    },
    [mergeSectionsWithAssignments],
  );

  const applyMergedSectionsLocally = useCallback(
    (mergedSections: SectionDto[]) => {
      setData((prev) => (prev ? { ...prev, sections: mergedSections } : prev));
      if (solverInput) {
        setSolverInput({
          ...solverInput,
          sections: toSchedulingSections(mergedSections),
        });
      }
    },
    [solverInput, toSchedulingSections],
  );

  useEffect(() => {
    sectionStatesRef.current = Object.fromEntries(
      (data?.sections ?? []).map((section) => [
        section.id,
        normalizeSectionState(section.state),
      ]),
    );
  }, [data?.sections]);

  const persistCalendarAssignments = useCallback(
    async (nextAssignments: AssignmentMap) => {
      if (!data) return;
      const mergedSections = buildMergedSectionsForSave(nextAssignments);
      applyMergedSectionsLocally(mergedSections);
      try {
        await persistSections(mergedSections);
        if (solverInput) {
          updateLastRunStorageRef.current?.(solverInput, nextAssignments, sectionLocks);
        }
        if (typeof window !== "undefined") {
          await recordOwnServerWrite();
          window.dispatchEvent(new Event(SCHEDULING_DATA_REFRESH_EVENT));
        }
      } catch (err) {
        const raw = err instanceof Error ? err.message : "";
        const hint = /fetch failed|failed to fetch|econnrefused/i.test(raw)
          ? " Is the solver service running?"
          : "";
        setBackendSaveMessage({
          type: "error",
          text: raw
            ? `Calendar placement saved locally but failed to sync backend: ${raw}${hint}`
            : "Calendar placement saved locally but failed to sync backend.",
        });
      }
    },
    [
      applyMergedSectionsLocally,
      buildMergedSectionsForSave,
      data,
      persistSections,
      recordOwnServerWrite,
      sectionLocks,
      solverInput,
    ],
  );

  const resolveEditorInvalidationForSection = useCallback(
    (sectionId: string) => {
      if (!data) return;
      const linkedIds = crosslistPeerSectionIds(sectionId, data.sections);
      clearEditorInvalidation(linkedIds);
      setEditorInvalidatedPlacements((prev) => {
        const next = new Map(prev);
        for (const id of linkedIds) next.delete(id);
        return next;
      });
    },
    [data],
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
    const validation = resolveStaggeredPatternPlacement(
      sectionId,
      targetRoomId,
      nextTimeslotIds,
      assignmentsBySection,
      { anchorSlotId: meetingPatternSelectionModal.anchorSlotId },
    );
    if (!validation.ok) {
      setMeetingPatternSelectionError(validation.message);
      setDragFeedback({ status: "invalid", message: validation.message });
      return;
    }

    const linkedSectionIds = data ? crosslistPeerSectionIds(sectionId, data.sections) : [sectionId];
    const nextAssignments: AssignmentMap = { ...assignmentsBySection };
    for (const linkedSectionId of linkedSectionIds) {
      nextAssignments[linkedSectionId] = {
        timeslot_ids: [...validation.timeslotIds],
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
        linkedSectionIds.map((linkedSectionId) => [linkedSectionId, [...validation.timeslotIds]]),
      ),
    }));
    void persistCalendarAssignments(nextAssignments);
    resolveEditorInvalidationForSection(sectionId);
    setMeetingPatternSelectionModal(null);
    setMeetingPatternSelectionError(null);
    placementCommittedRef.current = true;
    if (validation.conflictSectionIds.length) {
      setConflictSectionIds(new Set(validation.conflictSectionIds));
    } else {
      setConflictSectionIds(new Set());
    }
    setDragFeedback({
      status: validation.staggered || validation.conflictSectionIds.length ? "warning" : "valid",
      message: validation.message,
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
    resolveEditorInvalidationForSection,
    validatePatternPlacement,
    resolveStaggeredPatternPlacement,
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

  useEffect(() => {
    const validTagKeys = new Set(tagFilterOptions.map((option) => option.key));
    setSelectedTagKeys((prev) => prev.filter((id) => validTagKeys.has(id)));
  }, [tagFilterOptions]);

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
      const tagMatch =
        selectedTagKeys.length === 0 ||
        (section.tags ?? []).some((tag) => selectedTagKeys.includes(tag.trim()));
      return departmentMatch && instructorMatch && tagMatch;
    },
    [selectedDepartmentKeys, selectedInstructorIds, selectedTagKeys],
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
    if (selectedTagKeys.length > 0) {
      const labels = [...selectedTagKeys].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      );
      lines.push({ key: "tags", label: "Tags", value: labels.join(", ") });
    }
    return lines;
  }, [selectedDepartmentKeys, selectedInstructorIds, selectedTagKeys, departmentFilterOptions, professorFilterOptions]);

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
      .filter((s) => !isOnlineSection(s))
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

  const onlineDayEvents = useMemo(() => {
    if (!data) return [];
    const baseEvents = data.sections
      .filter((s) => isOnlineSection(s))
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
        return { section: { ...s, room_id: null }, timeslot: ts, start, end };
      })
      .filter((x) => x.timeslot && timeslotMatchesDay(x.timeslot, selectedDay))
      .sort((a, b) => a.start - b.start);
    return assignCalendarEventLanes(
      mergeCrosslistCalendarEvents(baseEvents as RawCalendarEvent[]),
    );
  }, [assignmentsBySection, data, selectedDay, solverTimeslotIdsBySection, timeslotById]);

  const placementConflictEvents = useMemo(
    () => buildPlacementConflictEvents(allDayEvents, onlineDayEvents),
    [allDayEvents, onlineDayEvents],
  );

  const onlineBandTrackHeight = useMemo(() => {
    const laneCount = Math.max(
      1,
      onlineDayEvents.reduce((max, event) => Math.max(max, (event.lane ?? 0) + 1), 0),
    );
    return (
      EVENT_TOP_PADDING_PX +
      laneCount * EVENT_HEIGHT_PX +
      Math.max(0, laneCount - 1) * EVENT_GAP_PX +
      EVENT_TOP_PADDING_PX
    );
  }, [onlineDayEvents]);

  const onlineEventTopPx = (lane: number) =>
    EVENT_TOP_PADDING_PX + lane * (EVENT_HEIGHT_PX + EVENT_GAP_PX);

  const queueSectionRows = useMemo(() => {
    if (!data) return [];
    return data.sections.map((section) => {
      const assignment = resolveEffectiveAssignment(
        section,
        assignmentsBySection[section.id],
        solverTimeslotIdsBySection[section.id],
      );
      const inst = instructorById.get(section.instructor_id);
      return {
        id: section.id,
        department: section.department,
        course_id: section.course_id,
        section_code: section.section_code,
        section_number: section.section_number,
        instructor_id: section.instructor_id,
        instructorName: inst?.name?.trim() || section.instructor_id || "—",
        allowed_meeting_patterns: section.allowed_meeting_patterns,
        tags: section.tags ?? [],
        state: section.state,
        assignment,
        room_id: section.room_id,
        timeslot_id: section.timeslot_id,
        previous_meeting_pattern: section.previous_meeting_pattern,
        isGhost: ghostSectionIds.has(section.id),
        editorInvalidation: editorInvalidatedPlacements.get(section.id) ?? null,
      };
    });
  }, [
    assignmentsBySection,
    data,
    editorInvalidatedPlacements,
    ghostSectionIds,
    instructorById,
    solverTimeslotIdsBySection,
  ]);

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

  const getOnlineEventsForDay = (day: Day) => {
    if (!data) return [];
    const baseEvents = data.sections
      .filter((section) => sectionMatchesFilters(section) && isOnlineSection(section))
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
        return { section: { ...s, room_id: null }, timeslot: ts, start, end };
      })
      .filter((x) => x.timeslot && timeslotMatchesDay(x.timeslot, day))
      .sort((a, b) => a.start - b.start);

    return assignCalendarEventLanes(
      mergeCrosslistCalendarEvents(baseEvents as RawCalendarEvent[]),
    ).filter((event) => calendarEventMatchesFilters(event, sectionMatchesFilters));
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
    const orderedRooms = sortRooms(data.rooms, roomSortMode);
    return orderedRooms.map((room) => {
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
  }, [allEventsByRoom, data, roomSortMode, sectionMatchesFilters]);

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

    return sortRooms(data.rooms, roomSortMode).map((room) => {
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

  const handleExportRoomAssignments = useCallback(() => {
    if (!data || isExportingRoomAssignments) return;
    setIsExportingRoomAssignments(true);
    void downloadRoomAssignmentWorkbook({
      sections: data.sections,
      instructors: data.instructors,
      rooms: data.rooms,
      timeslots: data.timeslots,
      assignments: assignmentsBySection,
    })
      .catch((err) => {
        console.error("Room assignment export failed", err);
      })
      .finally(() => {
        setIsExportingRoomAssignments(false);
      });
  }, [assignmentsBySection, data, isExportingRoomAssignments]);

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

  const captureSectionStates = useCallback((): Record<string, SectionState> | undefined => {
    if (!data) return undefined;
    return Object.fromEntries(
      data.sections.map((section) => [section.id, normalizeSectionState(section.state)]),
    );
  }, [data]);

  const restoreAssignmentsSnapshot = useCallback(
    (snapshot: UndoSnapshot) => {
      setAssignmentsBySection(snapshot.assignmentsBySection);
      setSolverTimeslotIdsBySection(snapshot.solverTimeslotIdsBySection);
      if (!data) return;
      const baseSections = snapshot.sectionStates
        ? data.sections.map((section) => ({
            ...section,
            state:
              snapshot.sectionStates?.[section.id] ?? normalizeSectionState(section.state),
          }))
        : data.sections;
      const mergedForSave = buildMergedSectionsForSave(
        snapshot.assignmentsBySection,
        baseSections,
      );
      applyMergedSectionsLocally(mergedForSave);
      const sectionStateChanged = snapshot.sectionStates
        ? data.sections.some((section) => {
            const restored = snapshot.sectionStates?.[section.id];
            if (!restored) return false;
            return normalizeSectionState(section.state) !== restored;
          })
        : false;
      if (sectionStateChanged) {
        void persistSections(mergedForSave);
      }
    },
    [
      applyMergedSectionsLocally,
      buildMergedSectionsForSave,
      data,
      persistSections,
    ],
  );

  const handleUndo = useCallback(() => {
    const stack = undoStackRef.current;
    const snapshot = stack[stack.length - 1];
    if (!snapshot) return;
    const currentSnapshot: UndoSnapshot = {
      key: stateKeyForUndo(assignmentsBySection, solverTimeslotIdsBySection),
      assignmentsBySection,
      solverTimeslotIdsBySection,
      backendSaveMessage,
      sectionStates: captureSectionStates(),
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
    restoreAssignmentsSnapshot(snapshot);
    restoreSnapshotFeedback(snapshot);
    setBackendSaveMessage(snapshot.backendSaveMessage);
  }, [
    assignmentsBySection,
    backendSaveMessage,
    captureSectionStates,
    conflictSectionIds,
    dragFeedback,
    restoreAssignmentsSnapshot,
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
      sectionStates: captureSectionStates(),
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

    restoreAssignmentsSnapshot(snapshot);
    restoreSnapshotFeedback(snapshot);
    setBackendSaveMessage(snapshot.backendSaveMessage);
  }, [
    assignmentsBySection,
    backendSaveMessage,
    captureSectionStates,
    conflictSectionIds,
    dragFeedback,
    restoreAssignmentsSnapshot,
    restoreSnapshotFeedback,
    solverTimeslotIdsBySection,
    stateKeyForUndo,
  ]);

  const updateLastRunStorage = useCallback(
    (nextInput: SchedulingInput, assignments: AssignmentMap, locks?: Record<string, SectionLockState>) => {
      const lockMap = locks ?? sectionLocks;
      if (typeof window === "undefined") return;
      const existingRaw = localStorage.getItem(LAST_SOLVER_RUN_STORAGE_KEY);
      let createdAt = new Date().toISOString();
      let name: string | undefined;
      try {
        if (existingRaw) {
          const existing = JSON.parse(existingRaw) as { createdAt?: string; name?: string };
          if (existing.createdAt) createdAt = existing.createdAt;
          if (existing.name) name = existing.name;
        }
      } catch { /* ignore */ }
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
          sectionLocks: lockMap,
          createdAt,
          dataRevision: sharedScheduleMeta.dataRevision ?? displayedDataRevision ?? undefined,
          ...(name ? { name } : {}),
        }),
      );
      window.dispatchEvent(new Event("lastSolverRunUpdated"));
    },
    [sectionLocks, displayedDataRevision, sharedScheduleMeta.dataRevision],
  );
  updateLastRunStorageRef.current = updateLastRunStorage;

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

  useEffect(() => {
    setCalendarUnsavedPlacementsFlag(hasValidUnsavedEdit);
  }, [hasValidUnsavedEdit]);

  const loadPendingOrphans = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(ORPHAN_PENDING_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SectionDto[];
      if (!Array.isArray(parsed) || !parsed.length) return;
      setOrphanModalSections(
        parsed.map((section) => ({
          ...section,
          instructorName:
            instructorById.get(section.instructor_id)?.name?.trim() ||
            section.instructor_id ||
            "—",
        })) as SectionDto[] & { instructorName: string }[],
      );
    } catch {
      /* ignore */
    }
  }, [instructorById]);

  useEffect(() => {
    loadPendingOrphans();
  }, [loadPendingOrphans]);

  useEffect(() => {
    const onMerged = (event: Event) => {
      const detail = (event as CustomEvent<{
        editorInvalidatedPlacements?: EditorInvalidatedPlacement[];
      }>).detail;
      const snap = readLastSolverRunSnapshot();
      if (snap) {
        try {
          applyRunSnapshot(snap);
        } catch {
          /* ignore invalid snapshot */
        }
      }
      const invalidated =
        detail?.editorInvalidatedPlacements ?? readEditorInvalidatedPlacements();
      setEditorInvalidatedPlacements(editorInvalidatedPlacementsToMap(invalidated));
      loadPendingOrphans();
    };
    window.addEventListener(SCHEDULING_SNAPSHOT_MERGED_EVENT, onMerged);
    return () => window.removeEventListener(SCHEDULING_SNAPSHOT_MERGED_EVENT, onMerged);
  }, [applyRunSnapshot, loadPendingOrphans]);

  useEffect(() => {
    if (!data || editorInvalidatedPlacements.size === 0) return;
    const invalidatedIds = Array.from(editorInvalidatedPlacements.keys());
    setAssignmentsBySection((prev) => {
      let changed = false;
      const next: AssignmentMap = { ...prev };
      for (const id of invalidatedIds) {
        const section = data.sections.find((s) => s.id === id);
        const preserved = String(
          prev[id]?.meeting_pattern_id ?? section?.previous_meeting_pattern ?? "",
        ).trim();
        const current = prev[id];
        if (
          current &&
          (current.timeslot_ids?.length || String(current.room_id ?? "").trim())
        ) {
          next[id] = { timeslot_ids: [], room_id: "", meeting_pattern_id: preserved };
          changed = true;
        } else if (!current) {
          next[id] = { timeslot_ids: [], room_id: "", meeting_pattern_id: preserved };
          changed = true;
        }
      }
      if (!changed) return prev;
      const mergedSections = mergeSectionsWithAssignments(next);
      setData((d) => (d ? { ...d, sections: mergedSections } : d));
      return next;
    });
    setSolverTimeslotIdsBySection((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of invalidatedIds) {
        if (next[id]?.length) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [data, editorInvalidatedPlacements, mergeSectionsWithAssignments]);

  const unplaceSection = useCallback(
    (sectionId: string) => {
      if (!data) return;
      const linkedIds = linkedSectionIdsBySection.get(sectionId) ?? [sectionId];
      pushUndoSnapshot({
        assignmentsBySection,
        solverTimeslotIdsBySection,
        backendSaveMessage,
        dragFeedback,
        conflictSectionIds,
      });
      const nextAssignments: AssignmentMap = { ...assignmentsBySection };
      const nextSolverTimeslots = { ...solverTimeslotIdsBySection };
      for (const id of linkedIds) {
        const preservedPattern = String(
          assignmentsBySection[id]?.meeting_pattern_id ??
            data.sections.find((s) => s.id === id)?.previous_meeting_pattern ??
            "",
        ).trim();
        nextAssignments[id] = {
          timeslot_ids: [],
          room_id: "",
          meeting_pattern_id: preservedPattern,
        };
        nextSolverTimeslots[id] = [];
      }
      setAssignmentsBySection(nextAssignments);
      setSolverTimeslotIdsBySection(nextSolverTimeslots);
      setPendingPlacementSectionId(null);
      setQueueDragSectionId(null);
      const mergedSections = mergeSectionsWithAssignments(nextAssignments);
      setData((prev) => (prev ? { ...prev, sections: mergedSections } : prev));
      setDragFeedback({
        status: "neutral",
        message: "Section moved to queue.",
      });
      if (solverInput) {
        const nextInput = { ...solverInput, sections: toSchedulingSections(mergedSections) };
        setSolverInput(nextInput);
        updateLastRunStorage(nextInput, nextAssignments);
      }
      void persistCalendarAssignments(nextAssignments);
    },
    [
      assignmentsBySection,
      backendSaveMessage,
      conflictSectionIds,
      data,
      dragFeedback,
      linkedSectionIdsBySection,
      mergeSectionsWithAssignments,
      persistCalendarAssignments,
      pushUndoSnapshot,
      solverInput,
      solverTimeslotIdsBySection,
      toSchedulingSections,
      updateLastRunStorage,
    ],
  );

  const autoOpenQueueSidebar = useCallback(() => {
    setQueueSidebarOpen((open) => {
      if (!open) {
        queueSidebarAutoOpenedRef.current = true;
        return true;
      }
      return open;
    });
  }, []);

  const maybeCloseAutoOpenedQueueSidebar = useCallback((droppedInSidebar: boolean) => {
    if (queueSidebarAutoOpenedRef.current && !droppedInSidebar) {
      setQueueSidebarOpen(false);
    }
    queueSidebarAutoOpenedRef.current = false;
    sidebarUnplaceDropSucceededRef.current = false;
  }, []);

  const handleQueueSidebarUnplaceDrop = useCallback(
    (sectionId: string) => {
      sidebarUnplaceDropSucceededRef.current = true;
      unplaceSection(sectionId);
    },
    [unplaceSection],
  );

  const resolveOrphanSections = useCallback(
    (sectionIds: string[], action: "keep" | "remove") => {
      if (action === "keep") {
        setGhostSectionIds((prev) => new Set([...Array.from(prev), ...sectionIds]));
      } else {
        for (const id of sectionIds) {
          unplaceSection(id);
        }
        setGhostSectionIds((prev) => {
          const next = new Set(prev);
          for (const id of sectionIds) next.delete(id);
          return next;
        });
      }
      setOrphanModalSections((prev) => prev.filter((s) => !sectionIds.includes(s.id)));
      if (typeof window !== "undefined") {
        const remaining = orphanModalSections.filter((s) => !sectionIds.includes(s.id));
        if (!remaining.length) {
          sessionStorage.removeItem(ORPHAN_PENDING_STORAGE_KEY);
        }
      }
    },
    [orphanModalSections, unplaceSection],
  );

  const cancelPlacementMode = useCallback(() => {
    setPendingPlacementSectionId(null);
    setPlacementPreview(null);
    setQueueDragSectionId(null);
    setDragFeedback({ status: "neutral", message: null });
  }, []);

  useEffect(() => {
    if (!pendingPlacementSectionId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelPlacementMode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelPlacementMode, pendingPlacementSectionId]);

  useEffect(() => {
    if (!queueUnplaceDrag) return;
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== queueUnplaceDrag.pointerId) return;
      const dist = Math.hypot(e.clientX - queueUnplaceDrag.startX, e.clientY - queueUnplaceDrag.startY);
      setQueueUnplaceDrag((prev) =>
        prev && prev.pointerId === e.pointerId
          ? {
              ...prev,
              clientX: e.clientX,
              clientY: e.clientY,
              hasMoved: prev.hasMoved || dist > CALENDAR_DRAG_MOVE_THRESHOLD_PX,
            }
          : prev,
      );
      if (!queueSidebarOpen) {
        const sidebarRect = queueSidebarRef.current?.getBoundingClientRect();
        const nearLeftEdge = e.clientX < QUEUE_SIDEBAR_AUTO_OPEN_EDGE_PX;
        const overCollapsedSidebar =
          sidebarRect &&
          e.clientX >= sidebarRect.left &&
          e.clientX <= sidebarRect.right &&
          e.clientY >= sidebarRect.top &&
          e.clientY <= sidebarRect.bottom;
        if (nearLeftEdge || overCollapsedSidebar) {
          autoOpenQueueSidebar();
        }
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== queueUnplaceDrag.pointerId) return;
      const sidebarRect = queueSidebarRef.current?.getBoundingClientRect();
      const overSidebar =
        sidebarRect &&
        e.clientX >= sidebarRect.left &&
        e.clientX <= sidebarRect.right &&
        e.clientY >= sidebarRect.top &&
        e.clientY <= sidebarRect.bottom;
      const droppedInSidebar = !!overSidebar;
      if (droppedInSidebar) {
        unplaceSection(queueUnplaceDrag.sectionId);
      }
      maybeCloseAutoOpenedQueueSidebar(droppedInSidebar);
      setQueueUnplaceDrag(null);
    };
    document.addEventListener("pointermove", onPointerMove, { capture: true });
    document.addEventListener("pointerup", onPointerUp, { capture: true });
    document.addEventListener("pointercancel", onPointerUp, { capture: true });
    return () => {
      document.removeEventListener("pointermove", onPointerMove, { capture: true });
      document.removeEventListener("pointerup", onPointerUp, { capture: true });
      document.removeEventListener("pointercancel", onPointerUp, { capture: true });
    };
  }, [queueUnplaceDrag, queueSidebarOpen, unplaceSection, autoOpenQueueSidebar, maybeCloseAutoOpenedQueueSidebar]);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (queueSidebarOpen) return;
      if (!e.dataTransfer?.types.includes("text/section-id")) return;
      const sidebarRect = queueSidebarRef.current?.getBoundingClientRect();
      const nearLeftEdge = e.clientX < QUEUE_SIDEBAR_AUTO_OPEN_EDGE_PX;
      const overCollapsedSidebar =
        sidebarRect &&
        e.clientX >= sidebarRect.left &&
        e.clientX <= sidebarRect.right &&
        e.clientY >= sidebarRect.top &&
        e.clientY <= sidebarRect.bottom;
      if (nearLeftEdge || overCollapsedSidebar) {
        e.preventDefault();
        autoOpenQueueSidebar();
      }
    };
    document.addEventListener("dragover", onDragOver);
    return () => document.removeEventListener("dragover", onDragOver);
  }, [queueSidebarOpen, autoOpenQueueSidebar]);

  useEffect(() => {
    const onDragStart = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("text/section-id")) return;
      queueSidebarAutoOpenedRef.current = false;
      sidebarUnplaceDropSucceededRef.current = false;
    };
    const onDragEnd = () => {
      maybeCloseAutoOpenedQueueSidebar(sidebarUnplaceDropSucceededRef.current);
    };
    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("dragend", onDragEnd);
    return () => {
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("dragend", onDragEnd);
    };
  }, [maybeCloseAutoOpenedQueueSidebar]);

  const setStatusBarContent = useSetStatusBarContent();
  useEffect(() => {
    if (!setStatusBarContent) return;
    const scheduleCreatedAt = displayedScheduleCreatedAtRef.current;
    const dataRev = displayedDataRevision ?? sharedScheduleMeta.dataRevision;
    const viewPredatesDataEdit =
      !!scheduleCreatedAt &&
      !!dataRev &&
      !Number.isNaN(new Date(dataRev.lastModifiedAt).getTime()) &&
      !Number.isNaN(new Date(scheduleCreatedAt).getTime()) &&
      new Date(dataRev.lastModifiedAt).getTime() > new Date(scheduleCreatedAt).getTime();
    setStatusBarContent(
      <div className="flex flex-col items-center justify-center gap-1 text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
          {dataRev ? (
            <span>
              Data edited{dataRev.lastModifiedByName ? ` by ${dataRev.lastModifiedByName}` : ""}{" "}
              at{" "}
              {new Date(dataRev.lastModifiedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          ) : null}
          {scheduleCreatedAt ? (
            <>
              <span className="hidden sm:inline text-slate-300" aria-hidden>
                •
              </span>
              <span>
                Last solved at{" "}
                {new Date(scheduleCreatedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </>
          ) : null}
        </div>
        {viewPredatesDataEdit ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
            View predates latest data edit — rerun the solver to refresh
          </span>
        ) : null}
        {editorInvalidatedPlacements.size > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
            {editorInvalidatedPlacements.size} section
            {editorInvalidatedPlacements.size === 1 ? "" : "s"} need attention (editor changes)
          </span>
        ) : null}
        {hasValidUnsavedEdit && (
          <p className="text-[11px] font-semibold text-emerald-700">
            Unsaved valid edits are ready to sync.
          </p>
        )}
      </div>,
    );
    return () => { setStatusBarContent(null); };
  }, [setStatusBarContent, displayedDataRevision, sharedScheduleMeta.dataRevision, hasValidUnsavedEdit]);

  // React to solver runs published by other live users. On first poll, if a
  // shared schedule already exists and the page is clean, apply it so late
  // joiners see the current shared revision (not only subsequent bumps).
  useEffect(() => {
    const rev = sharedScheduleMeta.revision;
    if (!sharedInitializedRef.current) {
      if (rev > 0) {
        sharedInitializedRef.current = true;
        const clean = !hasValidUnsavedEdit && !historyViewActiveRef.current;
        if (clean && solverRunStatus !== "loading") {
          void applySharedSnapshot();
        } else {
          appliedSharedRevisionRef.current = rev;
          if (!clean) {
            setIncomingShared({ revision: rev, ranBy: sharedScheduleMeta.ranBy });
          }
        }
      }
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

  const getSectionLockState = useCallback(
    (sectionId: string): SectionLockState => {
      if (!data) return "none";
      const peers = crosslistPeerSectionIds(sectionId, data.sections);
      for (const id of peers) {
        const state = sectionLocks[id];
        if (state === "hard") return "hard";
        if (state === "soft") return "soft";
      }
      return "none";
    },
    [data, sectionLocks],
  );

  const canLockSectionPlacement = useCallback(
    (sectionId: string) => {
      if (!data) return false;
      const section = data.sections.find((s) => s.id === sectionId);
      if (!section) return false;
      const a = normalizeAssignmentMapEntry(section, assignmentsBySection);
      return isSectionScheduled(section, a);
    },
    [assignmentsBySection, data],
  );

  const cycleLockForSection = useCallback(
    (sectionId: string, shiftKey = false, target?: SectionLockState) => {
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
      const current = getSectionLockState(sectionId);

      let next: SectionLockState;
      if (target) {
        next = target;
      } else if (shiftKey) {
        next = "hard";
      } else {
        if (current === "none") next = "soft";
        else if (current === "soft") next = "hard";
        else next = "none";
      }

      setSectionLocks((prev) => {
        const updated = { ...prev };
        for (const p of peers) {
          if (next === "none") delete updated[p];
          else updated[p] = next;
        }
        return updated;
      });
      locksDirtyRef.current = true;

      if (next !== "none" && calendarDrag && peers.includes(calendarDrag.sectionId)) {
        setCalendarDrag(null);
      }
      setCalendarContextMenu(null);
    },
    [calendarDrag, canLockSectionPlacement, data, getSectionLockState],
  );

  // Entry point for the on-card lock button. For staggered sections, locking
  // first surfaces a confirmation dialog. Shift-click always hard-locks.
  const requestToggleLockFromCalendar = useCallback(
    (sectionId: string, shiftKey = false) => {
      const current = getSectionLockState(sectionId);
      const willLock = current === "none";
      if (willLock && !canLockSectionPlacement(sectionId)) {
        setDragFeedback({
          status: "invalid",
          message: "Assign a room and times before locking this section.",
        });
        return;
      }
      if (willLock && !shiftKey && sectionIsStaggered(sectionId)) {
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
      cycleLockForSection(sectionId, shiftKey);
    },
    [
      canLockSectionPlacement,
      getSectionLockState,
      sectionById,
      sectionDayTimes,
      sectionIsStaggered,
      cycleLockForSection,
    ],
  );

  const confirmStaggeredLock = useCallback(() => {
    if (!staggeredLockConfirm) return;
    cycleLockForSection(staggeredLockConfirm.sectionId);
    setStaggeredLockConfirm(null);
  }, [staggeredLockConfirm, cycleLockForSection]);

  const lockAllSections = useCallback(() => {
    if (!data) return;
    const next: Record<string, SectionLockState> = {};
    let lockedCount = 0;
    for (const s of data.sections) {
      const a = normalizeAssignmentMapEntry(s, assignmentsBySection);
      if (!a.timeslot_ids.length || !a.room_id) continue;
      const peers = crosslistPeerSectionIds(s.id, data.sections);
      for (const p of peers) {
        if (next[p] !== "hard") {
          next[p] = "hard";
          lockedCount++;
        }
      }
    }
    setSectionLocks(next);
    locksDirtyRef.current = true;
    if (calendarDrag && next[calendarDrag.sectionId]) {
      setCalendarDrag(null);
    }
    setDragFeedback({
      status: lockedCount > 0 ? "valid" : "neutral",
      message:
        lockedCount > 0
          ? `${lockedCount} section(s) locked. Cross-listed peers lock together.`
          : "No sections with both a room and times to lock.",
    });
  }, [assignmentsBySection, calendarDrag, data]);

  const unlockAllLocks = useCallback(() => {
    setSectionLocks({});
    locksDirtyRef.current = true;
    setDragFeedback({
      status: "valid",
      message: "Cleared all locks for this calendar session.",
    });
  }, []);

  const hasAnyLock = useMemo(
    () => Object.values(sectionLocks).some((v) => v !== "none"),
    [sectionLocks],
  );

  const lockCount = useMemo(
    () => Object.keys(sectionLocks).length,
    [sectionLocks],
  );

  const lockBreakdown = useMemo(() => {
    let soft = 0;
    let hard = 0;
    for (const v of Object.values(sectionLocks)) {
      if (v === "soft") soft++;
      else if (v === "hard") hard++;
    }
    return { soft, hard };
  }, [sectionLocks]);

  const toggleAllLocks = useCallback(() => {
    if (hasAnyLock) {
      unlockAllLocks();
    } else {
      lockAllSections();
    }
  }, [hasAnyLock, lockAllSections, unlockAllLocks]);

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
      computeCalendarDayConflicts(allDayEvents, instructorById);
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
    updateLastRunStorage(solverInput, assignmentsBySection, sectionLocks);
    // Intentionally only when locks change — assignment changes persist via other flows.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignments read from latest render
  }, [sectionLocks, solverInput, updateLastRunStorage]);

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
      const lockPayloads = buildLockPayloads(
        sectionLocks,
        assignmentsBySection,
        sectionsForLocks,
      );
      const nextInput: SchedulingInput = {
        ...input,
        locked_assignments: lockPayloads.locked_assignments,
        soft_locks: lockPayloads.soft_locks,
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
      if (response.status === 499) {
        // Cancelled — clear local progress; do not treat as an error page.
        failSolverProgress();
        setSolverRunStatus("idle");
        return;
      }
      if (!response.ok || result.status === "error") {
        const cancelled = (result.errors ?? []).some(
          (e) => (e as ValidationError).code === "solver_cancelled",
        );
        if (cancelled) {
          failSolverProgress();
          setSolverRunStatus("idle");
          return;
        }
        const errors = (result.errors ?? []) as ValidationError[];
        storeSolverErrorSnapshot(nextInput, errors, result.diagnostics);
        failSolverProgress();
        router.push("/solver-errors");
        return;
      }
      const assignments = result.assignments ?? [];
      const sectionByIdForSolver = new Map(
        (data?.sections ?? nextInput.sections).map((section) => [section.id, section]),
      );
      const nextAssignments: AssignmentMap = Object.fromEntries(
        assignments.map((assignment) => [
          assignment.section_id,
          mapSolverAssignmentEntry(
            sectionByIdForSolver.get(assignment.section_id) ?? { section_number: "" },
            assignment,
          ),
        ]),
      );
      const allTimeslotIdsBySection = Object.fromEntries(
        assignments.map((assignment) => [assignment.section_id, assignment.timeslot_ids]),
      );
      setSolverInput(nextInput);
      setAssignmentsBySection(nextAssignments);
      setBaselineAssignments(nextAssignments);
      setSolverTimeslotIdsBySection(allTimeslotIdsBySection);
      updateLastRunStorage(nextInput, nextAssignments, sectionLocks);
      // This run is the newest shared schedule; adopt its revision so the sync
      // effect doesn't treat our own result as an incoming change, and mark the
      // fresh iteration as not-yet-saved to history.
      if (typeof result.shared_revision === "number") {
        appliedSharedRevisionRef.current = result.shared_revision;
      }
      // The server already published this run as the active schedule, so the
      // live-publish watcher must not echo it back.
      lastActiveSignatureRef.current = activeViewSignature(nextAssignments, sectionLocks);
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
              room_id: normalizeAssignmentRoomId(section, assignment?.room_id ?? null) || null,
              timeslot_id: assignment?.timeslot_ids?.[0] ?? section.timeslot_id ?? null,
              timeslot_ids: assignment?.timeslot_ids ?? section.timeslot_ids ?? [],
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
    sectionLocks,
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

  const queuePlacementPossibleTimeslots = useMemo(() => {
    if (!data || !pendingPlacementSectionId) return [];
    const section = data.sections.find((s) => s.id === pendingPlacementSectionId);
    if (!section || isOnlineSection(section)) return [];
    const allowedDurations = getAllowedSlotDurationsForQueuePlacement(
      pendingPlacementSectionId,
      data,
      solverInput ?? null,
      selectedDay,
      timeslotById,
    );
    if (!allowedDurations.length) return [];
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
  }, [data, pendingPlacementSectionId, selectedDay, solverInput, timeslotById]);

  const onlineQueuePlacementPossibleTimeslots = useMemo(() => {
    if (!data || !pendingPlacementSectionId) return [];
    const section = data.sections.find((s) => s.id === pendingPlacementSectionId);
    if (!section || !isOnlineSection(section)) return [];
    const allowedDurations = getAllowedSlotDurationsForQueuePlacement(
      pendingPlacementSectionId,
      data,
      solverInput ?? null,
      selectedDay,
      timeslotById,
    );
    if (!allowedDurations.length) return [];
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
  }, [data, pendingPlacementSectionId, selectedDay, solverInput, timeslotById]);

  const onlineQueueBlockedTimeslotInfo = useMemo(() => {
    const blockedSlotIds = new Set<string>();
    const blockedReasonBySlotId = new Map<string, string>();
    if (!pendingPlacementSectionId || !onlineQueuePlacementPossibleTimeslots.length || !solverInput) {
      return { blockedSlotIds, blockedReasonBySlotId };
    }
    const linkedSectionIds = linkedSectionIdsBySection.get(pendingPlacementSectionId) ?? [
      pendingPlacementSectionId,
    ];
    for (const slot of onlineQueuePlacementPossibleTimeslots) {
      for (const linkedSectionId of linkedSectionIds) {
        const blockedMessage = findBlockedPlacementMessage(linkedSectionId, "", slot);
        if (!blockedMessage) continue;
        blockedSlotIds.add(slot.id);
        blockedReasonBySlotId.set(slot.id, blockedMessage);
        break;
      }
    }
    return { blockedSlotIds, blockedReasonBySlotId };
  }, [
    findBlockedPlacementMessage,
    linkedSectionIdsBySection,
    onlineQueuePlacementPossibleTimeslots,
    pendingPlacementSectionId,
    solverInput,
  ]);

  const onlineDragPossibleTimeslots = useMemo(() => {
    if (!data || !calendarDrag?.sectionId || calendarDrag.origin !== "online") return [];
    const section = data.sections.find((s) => s.id === calendarDrag.sectionId);
    if (!section || !isOnlineSection(section)) return [];
    const allowedDurations = getAllowedSlotDurationsForDrag(
      calendarDrag.sectionId,
      assignmentsBySection,
      data,
      solverInput ?? null,
      selectedDay,
      timeslotById,
      onlineDayEvents,
    );
    if (!allowedDurations.length) return [];
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
    assignmentsBySection,
    calendarDrag?.origin,
    calendarDrag?.sectionId,
    data,
    onlineDayEvents,
    selectedDay,
    solverInput,
    timeslotById,
  ]);

  const onlineDragBlockedTimeslotInfo = useMemo(() => {
    const blockedSlotIds = new Set<string>();
    const blockedReasonBySlotId = new Map<string, string>();
    if (!calendarDrag?.sectionId || !onlineDragPossibleTimeslots.length || !solverInput) {
      return { blockedSlotIds, blockedReasonBySlotId };
    }
    const linkedSectionIds = linkedSectionIdsBySection.get(calendarDrag.sectionId) ?? [
      calendarDrag.sectionId,
    ];
    for (const slot of onlineDragPossibleTimeslots) {
      for (const linkedSectionId of linkedSectionIds) {
        const blockedMessage = findBlockedPlacementMessage(linkedSectionId, "", slot);
        if (!blockedMessage) continue;
        blockedSlotIds.add(slot.id);
        blockedReasonBySlotId.set(slot.id, blockedMessage);
        break;
      }
    }
    return { blockedSlotIds, blockedReasonBySlotId };
  }, [
    calendarDrag?.sectionId,
    findBlockedPlacementMessage,
    linkedSectionIdsBySection,
    onlineDragPossibleTimeslots,
    solverInput,
  ]);

  const onlineDragPossibleTimeslotBoundaries = useMemo(() => {
    if (!onlineDragPossibleTimeslots.length) return [];
    const boundaries = new Set<number>();
    onlineDragPossibleTimeslots.forEach((slot) => {
      boundaries.add(slot.start);
      boundaries.add(slot.end);
    });
    return Array.from(boundaries)
      .filter((m) => m >= axisStart && m <= axisEnd)
      .sort((a, b) => a - b);
  }, [onlineDragPossibleTimeslots, axisStart, axisEnd]);

  const queueBlockedTimeslotInfo = useMemo(() => {
    const blockedSlotIds = new Set<string>();
    const blockedReasonBySlotId = new Map<string, string>();
    if (!pendingPlacementSectionId || !queuePlacementPossibleTimeslots.length || !solverInput) {
      return { blockedSlotIds, blockedReasonBySlotId };
    }
    const linkedSectionIds = linkedSectionIdsBySection.get(pendingPlacementSectionId) ?? [
      pendingPlacementSectionId,
    ];
    for (const roomRow of roomRows) {
      for (const slot of queuePlacementPossibleTimeslots) {
        for (const linkedSectionId of linkedSectionIds) {
          const blockedMessage = findBlockedPlacementMessage(
            linkedSectionId,
            roomRow.room.id,
            slot,
          );
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
    findBlockedPlacementMessage,
    linkedSectionIdsBySection,
    pendingPlacementSectionId,
    queuePlacementPossibleTimeslots,
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
        instructorConflictEvents: placementConflictEvents,
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
      if (alreadyPlaced) {
        setDragFeedback({ status: "neutral", message: null });
        setPatternApplyPrompt(null);
        return;
      }

      // Snapshot the pre-placement state (assignments + the toast/rings showing
      // right now) so undo restores the exact prior view without a re-scan.
      pushUndoSnapshot({
        assignmentsBySection,
        solverTimeslotIdsBySection,
        backendSaveMessage,
        dragFeedback,
        conflictSectionIds,
      });
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
      resolveEditorInvalidationForSection(sectionId);

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
        ? `Only ${selectedDay} was updated. Other pattern days: ${otherPatternDays.join(", ")}.`
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
      placementConflictEvents,
      backendSaveMessage,
      conflictSectionIds,
      dragFeedback,
      data,
      instructorById,
      linkedSectionIdsBySection,
      findBlockedPlacementMessage,
      pushUndoSnapshot,
      resolveEditorInvalidationForSection,
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
      const currentByDay = new Map(
        sectionDayTimes(sectionId).map((entry) => [entry.day, entry.timeLabel] as const),
      );
      return otherDays.map((day) => {
        const currentTimeLabel = currentByDay.get(day) ?? null;
        const slot = findSlotOnDayAtTime(day, anchorSlot.start_time, anchorSlot.end_time);
        if (!slot) {
          return {
            day,
            targetSlotId: null,
            timeLabel,
            currentTimeLabel,
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
          currentTimeLabel,
          severity: result.severity,
          message: result.message,
          // Pre-check clean days; leave conflicting/impossible days for the user.
          selected: result.severity === "ok",
        };
      });
    },
    [evaluatePatternDayPlacement, findSlotOnDayAtTime, sectionDayTimes],
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

  // Push calendar transient messages into the Dynamic Island.
  useEffect(() => {
    if (!dragFeedback.message) return;
    const tone =
      dragFeedback.status === "invalid"
        ? "error"
        : dragFeedback.status === "warning"
          ? "warn"
          : dragFeedback.status === "valid"
            ? "success"
            : "neutral";
    flash({
      tone,
      message: dragFeedback.message,
      durationMs: tone === "success" ? 2000 : 4500,
      action:
        patternApplyPrompt && dragFeedback.status === "warning"
          ? {
              label: "Apply to all pattern days",
              onPress: () => openPatternApplyModal(),
            }
          : undefined,
    });
  }, [
    dragFeedback.message,
    dragFeedback.status,
    patternApplyPrompt,
    flash,
    openPatternApplyModal,
  ]);

  useEffect(() => {
    if (!backendSaveMessage) return;
    flash({
      tone: backendSaveMessage.type === "success" ? "success" : "error",
      message: backendSaveMessage.text,
    });
  }, [backendSaveMessage, flash]);

  useEffect(() => {
    if (!solverRunError) return;
    flash({ tone: "error", message: solverRunError, durationMs: 5000 });
  }, [solverRunError, flash]);

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

  /** User chose to leave other pattern days alone — confirm that choice with feedback. */
  const keepStaggeredSchedule = useCallback(() => {
    if (!patternApplyModal) {
      setPatternApplyModal(null);
      return;
    }
    const { sectionId, courseLabel, anchorDay, anchorTimeLabel, rows } = patternApplyModal;
    const otherSummary = rows
      .map((row) => {
        const current = sectionDayTimes(sectionId).find((entry) => entry.day === row.day);
        return `${row.day} ${current?.timeLabel ?? row.timeLabel}`;
      })
      .join("; ");
    const message = otherSummary
      ? `Kept staggered: ${courseLabel} is at ${anchorTimeLabel} on ${anchorDay}; other days unchanged (${otherSummary}). Look for the shuffle icon on the top-left of the card.`
      : `Kept staggered: only ${anchorDay} was moved to ${anchorTimeLabel}. Other pattern days were left as-is.`;

    setPatternApplyModal(null);
    setPatternApplyPrompt(null);
    setDragFeedback({
      status: "warning",
      message,
    });
  }, [patternApplyModal, sectionDayTimes]);

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

  const minutesFromPointerInOnlineBand = useCallback(
    (clientX: number): number | null => {
      const el = onlineBandTrackRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const pct = clamp((clientX - r.left) / r.width, 0, 1);
      return axisStart + pct * axisRange;
    },
    [axisRange, axisStart],
  );

  const isPointerOverOnlineBand = useCallback((clientX: number, clientY: number): boolean => {
    const rect = onlineBandTrackRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }, []);

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
      const section = data.sections.find((s) => s.id === sectionId);
      if (section && isOnlineSection(section)) {
        return {
          severity: "block",
          reasonCode: "online_section",
          message:
            "Online sections (800–899) use the Online band below — set section number and place there.",
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
        instructorConflictEvents: placementConflictEvents,
        linkedSectionIds,
        instructorById,
        findBlockedPlacementMessage,
        formatTime: formatTimeAmPm,
      });
    },
    [
      allDayEvents,
      placementConflictEvents,
      assignmentsBySection,
      data,
      findBlockedPlacementMessage,
      instructorById,
      linkedSectionIdsBySection,
      selectedDay,
    ],
  );

  const commitQueuePlacementWithPattern = useCallback(
    (
      sectionId: string,
      targetRoomId: string,
      slot: TimeslotWithMinutes,
      placementCheck: PlacementEvaluation,
    ) => {
      const invalidation = editorInvalidatedPlacements.get(sectionId);
      if (invalidation?.reason === "pattern") {
        setDragFeedback({
          status: "invalid",
          message: "Update allowed meeting patterns in the editor before placing.",
        });
        return;
      }
      const patternOptions = buildMeetingPatternOptionsForPlacement(sectionId, slot.id);
      if (patternOptions.length === 0) {
        const message =
          "No compatible meeting patterns include this day/time. Suggested fix: place the section in a different timeslot or update meeting pattern compatibility.";
        setDragFeedback({ status: "invalid", message });
        setBackendSaveMessage({ type: "error", text: message });
        return;
      }
      const section = sectionById.get(sectionId);
      const preferredPatternId = String(
        assignmentsBySection[sectionId]?.meeting_pattern_id ??
          section?.previous_meeting_pattern ??
          section?.allowed_meeting_patterns?.[0] ??
          "",
      ).trim();

      const distinctPatternIds = new Set(patternOptions.map((o) => o.meetingPatternId));
      let selection: MeetingPatternPlacementOption;
      if (patternOptions.length === 1) {
        selection = patternOptions[0];
      } else if (distinctPatternIds.size === 1) {
        selection = patternOptions[0];
      } else if (preferredPatternId) {
        const preferred = patternOptions.find((o) => o.meetingPatternId === preferredPatternId);
        if (preferred) {
          selection = preferred;
        } else {
          const revertAssignments = assignmentsBySection;
          const revertSolverTimeslots = solverTimeslotIdsBySection;
          const revertBackendSaveMessage = backendSaveMessage;
          const revertDragFeedback = dragFeedback;
          const revertConflictSectionIds = Array.from(conflictSectionIds);
          const linkedSectionIds = data ? crosslistPeerSectionIds(sectionId, data.sections) : [sectionId];
          const previewAssignments: AssignmentMap = { ...assignmentsBySection };
          for (const linkedSectionId of linkedSectionIds) {
            previewAssignments[linkedSectionId] = {
              timeslot_ids: [slot.id],
              room_id: targetRoomId,
              meeting_pattern_id: previewAssignments[linkedSectionId]?.meeting_pattern_id ?? "",
            };
          }
          setAssignmentsBySection(previewAssignments);
          setSolverTimeslotIdsBySection((prev) => ({
            ...prev,
            ...Object.fromEntries(linkedSectionIds.map((id) => [id, [slot.id]])),
          }));
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
          setPendingPlacementSectionId(null);
          setPlacementPreview(null);
          placementCommittedRef.current = true;
          return;
        }
      } else {
        const revertAssignments = assignmentsBySection;
        const revertSolverTimeslots = solverTimeslotIdsBySection;
        const revertBackendSaveMessage = backendSaveMessage;
        const revertDragFeedback = dragFeedback;
        const revertConflictSectionIds = Array.from(conflictSectionIds);
        const linkedSectionIds = data ? crosslistPeerSectionIds(sectionId, data.sections) : [sectionId];
        const previewAssignments: AssignmentMap = { ...assignmentsBySection };
        for (const linkedSectionId of linkedSectionIds) {
          previewAssignments[linkedSectionId] = {
            timeslot_ids: [slot.id],
            room_id: targetRoomId,
            meeting_pattern_id: previewAssignments[linkedSectionId]?.meeting_pattern_id ?? "",
          };
        }
        setAssignmentsBySection(previewAssignments);
        setSolverTimeslotIdsBySection((prev) => ({
          ...prev,
          ...Object.fromEntries(linkedSectionIds.map((id) => [id, [slot.id]])),
        }));
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
        setPendingPlacementSectionId(null);
        setPlacementPreview(null);
        placementCommittedRef.current = true;
        return;
      }

      const validation = resolveStaggeredPatternPlacement(
        sectionId,
        targetRoomId,
        selection.timeslotIds,
        assignmentsBySection,
        { anchorSlotId: slot.id },
      );
      if (!validation.ok) {
        setDragFeedback({ status: "invalid", message: validation.message });
        return;
      }

      const linkedSectionIds = data ? crosslistPeerSectionIds(sectionId, data.sections) : [sectionId];
      pushUndoSnapshot({
        assignmentsBySection,
        solverTimeslotIdsBySection,
        backendSaveMessage,
        dragFeedback,
        conflictSectionIds,
      });

      const nextAssignments: AssignmentMap = { ...assignmentsBySection };
      for (const linkedSectionId of linkedSectionIds) {
        nextAssignments[linkedSectionId] = {
          timeslot_ids: [...validation.timeslotIds],
          room_id: targetRoomId,
          meeting_pattern_id: selection.meetingPatternId,
        };
      }
      setAssignmentsBySection(nextAssignments);
      setSolverTimeslotIdsBySection((prev) => ({
        ...prev,
        ...Object.fromEntries(
          linkedSectionIds.map((linkedSectionId) => [
            linkedSectionId,
            [...validation.timeslotIds],
          ]),
        ),
      }));
      void persistCalendarAssignments(nextAssignments);
      resolveEditorInvalidationForSection(sectionId);

      placementCommittedRef.current = true;
      setPendingPlacementSectionId(null);
      setPlacementPreview(null);

      const isWarning =
        placementCheck.severity === "warn" ||
        validation.staggered ||
        validation.conflictSectionIds.length > 0;
      if (validation.conflictSectionIds.length) {
        setConflictSectionIds(new Set(validation.conflictSectionIds));
      } else if (placementCheck.severity === "warn") {
        setConflictSectionIds(new Set(placementCheck.conflictSectionIds));
      } else {
        setConflictSectionIds(new Set());
      }

      setDragFeedback({
        status: isWarning ? "warning" : "valid",
        message: validation.message || placementCheck.message,
      });
      setBackendSaveMessage({
        type: "success",
        text:
          linkedSectionIds.length > 1
            ? `Cross-listed group placed (${selection.meetingPatternId}). Click Save to persist.`
            : `Section placed (${selection.meetingPatternId}). Click Save to persist.`,
      });
    },
    [
      assignmentsBySection,
      backendSaveMessage,
      buildMeetingPatternOptionsForPlacement,
      conflictSectionIds,
      data,
      dragFeedback,
      editorInvalidatedPlacements,
      persistCalendarAssignments,
      pushUndoSnapshot,
      resolveEditorInvalidationForSection,
      resolveStaggeredPatternPlacement,
      sectionById,
      solverTimeslotIdsBySection,
    ],
  );

  const updateQueueRoomPlacementPreview = useCallback(
    (roomId: string, clientX: number) => {
      if (!pendingPlacementSectionId || calendarDrag || !data) return;
      const pendingSection = data.sections.find((s) => s.id === pendingPlacementSectionId);
      if (pendingSection && isOnlineSection(pendingSection)) return;
      const mins = minutesFromPointerInRoom(clientX, roomId);
      if (mins === null) return;
      const allowedDurations = getAllowedSlotDurationsForQueuePlacement(
        pendingPlacementSectionId,
        data,
        solverInput ?? null,
        selectedDay,
        timeslotById,
      );
      const slot = selectSlotNearMinutes(
        data.timeslots,
        selectedDay,
        allowedDurations,
        mins,
      );
      if (!slot) {
        setPlacementPreview(null);
        setDragFeedback({
          status: "invalid",
          message:
            "No compatible slot here for this section's allowed meeting patterns.",
        });
        return;
      }
      const check = evaluatePlacement(pendingPlacementSectionId, roomId, slot);
      const canPlace = check.severity !== "block";
      setPlacementPreview({
        targetRoomId: roomId,
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
    },
    [
      calendarDrag,
      data,
      evaluatePlacement,
      minutesFromPointerInRoom,
      pendingPlacementSectionId,
      selectedDay,
      solverInput,
      timeslotById,
    ],
  );

  const commitPlacementByClick = useCallback(
    (sectionId: string, targetRoomId: string, slot: TimeslotWithMinutes) => {
      const check = evaluatePlacement(sectionId, targetRoomId, slot);
      if (check.severity === "block") {
        setDragFeedback({ status: "invalid", message: check.message });
        return;
      }
      if (pendingPlacementSectionId === sectionId) {
        commitQueuePlacementWithPattern(sectionId, targetRoomId, slot, check);
      }
    },
    [commitQueuePlacementWithPattern, evaluatePlacement, pendingPlacementSectionId],
  );

  const evaluateOnlinePlacement = useCallback(
    (sectionId: string, slot: TimeslotWithMinutes): PlacementEvaluation => {
      if (!data) {
        return {
          severity: "block",
          reasonCode: "missing_data",
          message: "Calendar data is unavailable.",
          conflictSectionIds: [],
        };
      }
      const section = data.sections.find((s) => s.id === sectionId);
      if (!section || !isOnlineSection(section)) {
        return {
          severity: "block",
          reasonCode: "missing_data",
          message: "Only online sections (800–899) can be placed in the Online band.",
          conflictSectionIds: [],
        };
      }
      const linkedSectionIds = linkedSectionIdsBySection.get(sectionId) ?? [sectionId];
      return evaluatePlacementShared({
        sectionId,
        targetRoomId: "",
        slot,
        selectedDay,
        data,
        assignmentsBySection,
        allDayEvents,
        instructorConflictEvents: placementConflictEvents,
        linkedSectionIds,
        instructorById,
        findBlockedPlacementMessage,
        formatTime: formatTimeAmPm,
      });
    },
    [
      allDayEvents,
      placementConflictEvents,
      assignmentsBySection,
      data,
      findBlockedPlacementMessage,
      instructorById,
      linkedSectionIdsBySection,
      selectedDay,
    ],
  );

  const commitOnlinePlacementByClick = useCallback(
    (sectionId: string, slot: TimeslotWithMinutes) => {
      const check = evaluateOnlinePlacement(sectionId, slot);
      if (check.severity === "block") {
        setDragFeedback({ status: "invalid", message: check.message });
        return;
      }
      if (pendingPlacementSectionId === sectionId) {
        commitQueuePlacementWithPattern(sectionId, "", slot, check);
      }
    },
    [commitQueuePlacementWithPattern, evaluateOnlinePlacement, pendingPlacementSectionId],
  );

  const commitOnlineCalendarPlacement = useCallback(
    (sectionId: string, selectedSlot: TimeslotWithMinutes) => {
      if (!data) return;
      const dragged = findCalendarEventBySectionId(onlineDayEvents, sectionId);
      if (!dragged || !dragged.timeslot) return;
      const linkedSectionIds = linkedSectionIdsBySection.get(sectionId) ?? [sectionId];
      const targetRoomId = "";

      const evaluation = evaluateOnlinePlacement(sectionId, selectedSlot);
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
        const linkedEvent = findCalendarEventBySectionId(onlineDayEvents, linkedSectionId);
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
      if (alreadyPlaced) {
        setDragFeedback({ status: "neutral", message: null });
        setPatternApplyPrompt(null);
        return;
      }

      pushUndoSnapshot({
        assignmentsBySection,
        solverTimeslotIdsBySection,
        backendSaveMessage,
        dragFeedback,
        conflictSectionIds,
      });
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
        ? `Only ${selectedDay} was updated. Other pattern days: ${otherPatternDays.join(", ")}.`
        : `Only ${selectedDay} was updated. This section uses a multi-day pattern — its other days are unchanged. Adjust them from the schedule table or re-place per day.`;

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
      backendSaveMessage,
      conflictSectionIds,
      data,
      dragFeedback,
      evaluateOnlinePlacement,
      linkedSectionIdsBySection,
      onlineDayEvents,
      pushUndoSnapshot,
      sectionHasMultiDayPattern,
      selectedDay,
      solverTimeslotIdsBySection,
      timeslotById,
    ],
  );

  const updateQueueOnlinePlacementPreview = useCallback(
    (clientX: number) => {
      if (!pendingPlacementSectionId || calendarDrag || !data) return;
      const pendingSection = data.sections.find((s) => s.id === pendingPlacementSectionId);
      if (!pendingSection || !isOnlineSection(pendingSection)) {
        setPlacementPreview(null);
        setDragFeedback({
          status: "invalid",
          message:
            "Only online sections (800–899) can be placed in the Online band. Unplace to the queue sidebar first.",
        });
        return;
      }
      const mins = minutesFromPointerInOnlineBand(clientX);
      if (mins === null) return;
      const allowedDurations = getAllowedSlotDurationsForQueuePlacement(
        pendingPlacementSectionId,
        data,
        solverInput ?? null,
        selectedDay,
        timeslotById,
      );
      const slot = selectSlotNearMinutes(
        data.timeslots,
        selectedDay,
        allowedDurations,
        mins,
      );
      if (!slot) {
        setPlacementPreview(null);
        setDragFeedback({
          status: "invalid",
          message:
            "No compatible slot here for this section's allowed meeting patterns.",
        });
        return;
      }
      const check = evaluateOnlinePlacement(pendingPlacementSectionId, slot);
      const canPlace = check.severity !== "block";
      setPlacementPreview({
        targetRoomId: "",
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
    },
    [
      calendarDrag,
      data,
      evaluateOnlinePlacement,
      minutesFromPointerInOnlineBand,
      pendingPlacementSectionId,
      selectedDay,
      solverInput,
      timeslotById,
    ],
  );

  const handleUpdateBackend = async (silent = false) => {
    if (!data || !hasValidUnsavedEdit) return;
    setIsSavingBackend(true);
    setBackendSaveMessage(null);
    try {
      const mergedSections = buildMergedSectionsForSave(assignmentsBySection);
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
    const wasOnline = existingSection ? isOnlineSection(existingSection) : false;
    const willBeOnline = isOnlineSection({ section_number: draft.section_number });
    let adjustedRoomId = preservedRoomId;
    let adjustedTimeslotIds = [...preservedTimeslotIds];
    let sectionMigrationMessage: string | null = null;
    if (sectionModal.mode === "edit" && wasOnline !== willBeOnline) {
      if (willBeOnline) {
        adjustedRoomId = "";
        sectionMigrationMessage =
          "Section is now online (800–899) — room cleared. Place it in the Online band from the queue.";
      } else {
        adjustedRoomId = "";
        adjustedTimeslotIds = [];
        sectionMigrationMessage =
          "Section is no longer online — unplace and assign a room on the calendar grid.";
      }
    }

    const normalizedSection: SectionDto = normalizeSectionForSave({
      id: draft.id.trim(),
      course_id: draft.course_id.trim(),
      department: draft.department.trim(),
      section_code: draft.section_code.trim(),
      section_number: draft.section_number.trim(),
      instructor_id: draft.instructor_id.trim(),
      expected_enrollment: Number(draft.expected_enrollment),
      enrollment_cap: Number(draft.enrollment_cap),
      allowed_meeting_patterns: [...draft.allowed_meeting_patterns],
      room_requirements: draft.room_requirements,
      crosslist_group_id: draft.crosslist_group_id.trim() || null,
      tags: draft.tags,
      state: normalizeSectionState(draft.state),
      previous_meeting_pattern:
        assignmentsBySection[draft.id.trim()]?.meeting_pattern_id ??
        existingSection?.previous_meeting_pattern ??
        undefined,
    }) as SectionDto;

    const sectionForPersist: SectionDto = {
      ...normalizedSection,
      room_id: adjustedRoomId || null,
      timeslot_id: adjustedTimeslotIds[0] ?? null,
      timeslot_ids: [...adjustedTimeslotIds],
      previous_meeting_pattern:
        assignmentsBySection[draft.id.trim()]?.meeting_pattern_id ??
        existingSection?.previous_meeting_pattern ??
        null,
    };

    let nextSections: SectionDto[];
    if (sectionModal.mode === "create") {
      nextSections = [...data.sections, sectionForPersist];
    } else {
      nextSections = data.sections.map((section) =>
        section.id === sectionModal.initialSectionId ? sectionForPersist : section,
      );
    }

    setIsSavingSection(true);
    try {
      await persistSections(nextSections);

      const nextAssignments: AssignmentMap = {
        ...assignmentsBySection,
        [sectionForPersist.id]: {
          timeslot_ids:
            sectionModal.mode === "edit" ? [...adjustedTimeslotIds] : [],
          room_id: sectionModal.mode === "edit" ? adjustedRoomId : "",
          meeting_pattern_id: assignmentsBySection[sectionForPersist.id]?.meeting_pattern_id ?? "",
        },
      };
      const nextSolverTimeslots = {
        ...solverTimeslotIdsBySection,
        [sectionForPersist.id]:
          sectionModal.mode === "edit" ? [...adjustedTimeslotIds] : [],
      };

      setData((prev) => (prev ? { ...prev, sections: nextSections } : prev));

      setAssignmentsBySection(nextAssignments);
      setSolverTimeslotIdsBySection(nextSolverTimeslots);
      setBaselineAssignments(nextAssignments);

      let nextInput: SchedulingInput | null = null;
      if (solverInput) {
        nextInput = {
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
            ? "Section added to unscheduled queue."
            : sectionMigrationMessage ?? "Section updates saved to backend.",
      });
      if (typeof window !== "undefined") {
        await recordOwnServerWrite();
        await publishActiveScheduleRef.current(nextInput ?? undefined);
        window.dispatchEvent(new Event(SCHEDULING_DATA_REFRESH_EVENT));
      }
      if (sectionModal.mode === "create") {
        setQueueSidebarOpen(true);
        setDragFeedback({
          status: "neutral",
          message:
            "Section added to unscheduled queue. Drag it onto the calendar or click to place.",
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
    async (inputOverride?: SchedulingInput): Promise<LastSolverRunSnapshot> => {
      let inputForSnapshot: SchedulingInput | null = inputOverride ?? solverInput;
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

      const lockPayloads = buildLockPayloads(
        sectionLocks,
        assignmentsBySection,
        data?.sections ?? [],
      );

      return {
        input: {
          ...inputForSnapshot,
          locked_assignments: lockPayloads.locked_assignments,
          soft_locks: lockPayloads.soft_locks,
        },
        solution: {
          assignments,
          total_score: 0,
          penalty_breakdown: {},
          explanations: [],
        },
        createdAt: new Date().toISOString(),
        sectionLocks,
        dataRevision: sharedScheduleMeta.dataRevision ?? undefined,
      };
    },
    [assignmentsBySection, data?.sections, sectionLocks, solverInput, sharedScheduleMeta.dataRevision],
  );

  // Publish the current view as the shared "active schedule" (Google-Docs-style
  // live collaboration). Debounced + signature-gated by the watcher below.
  const publishActiveSchedule = useCallback(async (inputOverride?: SchedulingInput) => {
    if (typeof window === "undefined") return;
    if (activePublishInFlightRef.current) return;
    activePublishInFlightRef.current = true;
    try {
      const snapshot = await buildSnapshotFromCurrentView(inputOverride);
      const res = await fetch("/api/shared-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      if (!res.ok) return;
      const meta = (await res.json()) as { revision?: number };
      if (typeof meta.revision === "number") {
        appliedSharedRevisionRef.current = meta.revision;
      }
      lastActiveSignatureRef.current = activeViewSignature(
        assignmentsBySection,
        sectionLocks,
      );
    } catch {
      // Best-effort: the next edit retriggers the debounced publish.
    } finally {
      activePublishInFlightRef.current = false;
    }
  }, [assignmentsBySection, buildSnapshotFromCurrentView, sectionLocks]);

  const publishActiveScheduleRef = useRef(publishActiveSchedule);
  publishActiveScheduleRef.current = publishActiveSchedule;

  // Watch for real local edits (assignment moves / lock changes) and publish
  // them as the active schedule. Baseline on mount; never echoes content that
  // this client already authored or applied (lastActiveSignatureRef).
  useEffect(() => {
    if (lastActiveSignatureRef.current === null) {
      lastActiveSignatureRef.current = activeViewSignature(assignmentsBySection, sectionLocks);
      return;
    }
    if (activeViewSignature(assignmentsBySection, sectionLocks) === lastActiveSignatureRef.current) {
      return;
    }
    if (solverRunStatus === "loading" || solverBusyRemote) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (activePublishTimerRef.current) clearTimeout(activePublishTimerRef.current);
    activePublishTimerRef.current = setTimeout(() => {
      activePublishTimerRef.current = null;
      if (activeViewSignature(assignmentsBySection, sectionLocks) === lastActiveSignatureRef.current) {
        return;
      }
      void publishActiveSchedule();
    }, 1600);
    return () => {
      if (activePublishTimerRef.current) {
        clearTimeout(activePublishTimerRef.current);
        activePublishTimerRef.current = null;
      }
    };
  }, [
    assignmentsBySection,
    sectionLocks,
    solverRunStatus,
    solverBusyRemote,
    publishActiveSchedule,
  ]);

  // Persist the current lock set to the solver DB (durable, shared with the
  // editor + solver) via a read-modify-write of /api/update-all so concurrent
  // editor edits are not clobbered. Gated on Auto-save, matching how calendar
  // placements and editor changes are persisted.
  const persistLocksToBackend = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!autoSaveEnabled) return;
    if (locksPersistInFlightRef.current) return;
    if (solverRunStatus === "loading" || solverBusyRemote) return;
    locksPersistInFlightRef.current = true;
    try {
      const res = await fetch("/api/data", { method: "GET" });
      const json = (await res.json()) as
        | { status: "ok"; data: SchedulingInput }
        | { status: "error"; errors?: { message?: string }[] };
      if (!res.ok || json.status !== "ok") return;

      const lockPayloads = buildLockPayloads(
        sectionLocks,
        assignmentsBySection,
        data?.sections ?? [],
      );
      // No-op guard: skip when the DB already reflects this exact lock set.
      const existing = sectionLocksFromInput(json.data);
      const next = sectionLocksFromInput(lockPayloads);
      if (JSON.stringify(existing) === JSON.stringify(next)) {
        locksDirtyRef.current = false;
        return;
      }

      const response = await fetch("/api/update-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...json.data,
          locked_assignments: lockPayloads.locked_assignments,
          soft_locks: lockPayloads.soft_locks,
        }),
      });
      const payload = (await response.json()) as
        | { status: "ok" }
        | { status: "error"; errors?: { message?: string }[] };
      if (!response.ok || payload.status === "error") return;

      locksDirtyRef.current = false;
      await recordOwnServerWrite();
      window.dispatchEvent(new Event(SCHEDULING_DATA_REFRESH_EVENT));
    } catch {
      // Best-effort: the next lock change retries.
    } finally {
      locksPersistInFlightRef.current = false;
    }
  }, [
    autoSaveEnabled,
    assignmentsBySection,
    data?.sections,
    recordOwnServerWrite,
    sectionLocks,
    solverBusyRemote,
    solverRunStatus,
  ]);

  // Watch for genuine user lock edits (flagged by the lock handlers, never by
  // hydration/apply) and persist them after a debounce. The dirty flag stays
  // set while blocked (autosave off / solver busy / tab hidden) so the edit is
  // persisted once unblocked.
  useEffect(() => {
    if (!autoSaveEnabled) return;
    if (solverRunStatus === "loading" || solverBusyRemote) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (!locksDirtyRef.current) return;
    if (locksPersistTimerRef.current) clearTimeout(locksPersistTimerRef.current);
    locksPersistTimerRef.current = setTimeout(() => {
      locksPersistTimerRef.current = null;
      void persistLocksToBackend();
    }, 1600);
    return () => {
      if (locksPersistTimerRef.current) {
        clearTimeout(locksPersistTimerRef.current);
        locksPersistTimerRef.current = null;
      }
    };
  }, [autoSaveEnabled, sectionLocks, solverRunStatus, solverBusyRemote, persistLocksToBackend]);

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
      await saveScheduleToHistory({
        name: trimmedName,
        scheduleDate: saveScheduleModal.draft.scheduleDate,
        snapshot,
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          LAST_SOLVER_RUN_STORAGE_KEY,
          JSON.stringify({ ...snapshot, name: trimmedName }),
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
  }, [assignmentsBySection, buildSnapshotFromCurrentView, saveScheduleModal.draft.name, saveScheduleModal.draft.scheduleDate, user?.email, user?.name]);

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
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-500">
      <CalendarHistoryNavbarPortal
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
      <div className="space-y-3">
        <PageHeader
          title="Schedule Output Calendar"
          subtitle="Click through Monday–Friday to view scheduled sections."
        />
      </div>

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

      {/* Day selector */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <nav aria-label="Calendar days" className={appToolbarShellClass}>
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setSelectedDay(d)}
              className={`${appNavLinkClass(selectedDay === d)} whitespace-nowrap`}
            >
              {d}
            </button>
          ))}
        </nav>
        <div className={editorToolbarShellClass}>
              {isMySolverRun ? (
                <Button
                  size="sm"
                  radius="md"
                  className="bg-rose-50 text-rose-700 border border-rose-200 data-[hover=true]:bg-rose-100"
                  startContent={<XCircle className="size-3.5" />}
                  onPress={() => {
                    void cancelRun().then(() => setSolverRunStatus("idle"));
                  }}
                >
                  Cancel Solver
                </Button>
              ) : (
                <Button
                  size="sm"
                  radius="md"
                  className={solverRunStatus !== "loading" && data && !solverBusyRemote ? editorToolbarBtnPrimary : "bg-slate-100 text-slate-400 cursor-not-allowed"}
                  startContent={<Play className="size-3.5" />}
                  isDisabled={solverRunStatus === "loading" || !data || solverBusyRemote}
                  onPress={() => void handleRunSolverFromCalendar()}
                  title={
                    solverBusyRemote
                      ? solverLock.startedBy
                        ? `Solver is running (started by ${solverLock.startedBy})`
                        : "Solver is running"
                      : "Run the solver using backend scheduling data and locks from this page"
                  }
                >
                  Run Solver
                </Button>
              )}
              {!autoSaveEnabled && hasValidUnsavedEdit && (
                <Button
                  size="sm"
                  radius="md"
                  className="bg-emerald-50 text-emerald-800 border border-emerald-200 data-[hover=true]:bg-emerald-100"
                  startContent={<CloudBackup className="size-3.5" />}
                  isDisabled={isSavingBackend}
                  onPress={() => void handleUpdateBackend(false)}
                  title="Autosave is off — click Save to persist calendar edits."
                >
                  Save
                </Button>
              )}
              <span className={editorToolbarDivider} />
              <Button
                size="sm"
                radius="md"
                className={editorToolbarBtnSecondary}
                startContent={<Save className="size-3.5" />}
                onPress={openSaveScheduleModal}
                title="Save this generated/edited schedule to history"
              >
                Save Schedule
              </Button>
              <Button
                size="sm"
                radius="md"
                className={editorToolbarBtnSecondary}
                startContent={<Share2 className="size-3.5" />}
                onPress={handleExportPdf}
                title="Export the visible calendar to PDF"
              >
                Export PDF
              </Button>
              <Button
                size="sm"
                radius="md"
                className={clsx(editorToolbarBtnSecondary, (!data || isExportingRoomAssignments) && "opacity-50 cursor-not-allowed")}
                startContent={<FileSpreadsheet className="size-3.5" />}
                isDisabled={!data || isExportingRoomAssignments}
                onPress={handleExportRoomAssignments}
                title="Download room assignments + calendar grid spreadsheet"
              >
                Export Rooms
              </Button>
              <span className={editorToolbarDivider} />
              <Button
                size="sm"
                radius="md"
                className={editorToolbarBtnSecondary}
                startContent={<Table2 className="size-3.5" />}
                onPress={() => setScheduleDrawerOpen(true)}
                title="Open the schedule table to bulk lock/unlock sections for the solver"
              >
                Schedule Table
                {hasAnyLock && (
                  <span className="ml-1 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold leading-4 text-center">
                    {lockCount}
                  </span>
                )}
              </Button>
            
        </div>
      </div>

      {/* Search, filters, colors, crosslist, add section */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <Input
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search sections…"
          size="sm"
          isClearable
          className="w-full max-w-[14rem]"
        />
        <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
        <Popover
          isOpen={filtersExpanded}
          onOpenChange={setFiltersExpanded}
          placement="bottom-start"
          {...navbarPopoverProps}
          shouldCloseOnInteractOutside={toolbarPanelCloseOnInteractOutside}
        >
          <PopoverTrigger>
            <button
              type="button"
              aria-expanded={filtersExpanded}
              className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Filter className="size-3.5 text-slate-400" aria-hidden />
              <span className="uppercase tracking-wider text-[10px] text-slate-500">Filters</span>
              {activeFilterCount > 0 ? (
                <span className="text-slate-400">{activeFilterCount}</span>
              ) : null}
              <ChevronDown
                className={clsx(
                  "size-3.5 text-slate-400 transition-transform",
                  filtersExpanded && "rotate-180",
                )}
                aria-hidden
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className={toolbarFormPopoverContentClass}
            aria-label="Filters"
          >
            <div
              ref={filtersPanelRef}
              className="max-h-[min(70vh,560px)] space-y-2 overflow-y-auto p-3"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-1 items-center gap-2 rounded-lg border border-default-200 bg-default-50/60 px-3 py-2 sm:grid-cols-[7rem_1fr_auto]">
                <span className="text-xs font-semibold uppercase tracking-wide text-default-600">
                  Departments
                </span>
                <div className="min-w-0 overflow-hidden">
                  <MultiSelect
                    placeholder="Any department…"
                    options={departmentFilterOptions}
                    value={selectedDepartmentKeys}
                    onChange={setSelectedDepartmentKeys}
                    showSearch
                  />
                </div>
                <Button
                  size="sm"
                  variant="light"
                  className="shrink-0 font-semibold"
                  isDisabled={selectedDepartmentKeys.length === 0}
                  onPress={() => setSelectedDepartmentKeys([])}
                >
                  Clear
                </Button>
              </div>
              <div className="grid grid-cols-1 items-center gap-2 rounded-lg border border-default-200 bg-default-50/60 px-3 py-2 sm:grid-cols-[7rem_1fr_auto]">
                <span className="text-xs font-semibold uppercase tracking-wide text-default-600">
                  Tags
                </span>
                <div className="min-w-0 overflow-hidden">
                  <MultiSelect
                    placeholder="Any tag…"
                    options={tagFilterOptions}
                    value={selectedTagKeys}
                    onChange={setSelectedTagKeys}
                    showSearch
                  />
                </div>
                <Button
                  size="sm"
                  variant="light"
                  className="shrink-0 font-semibold"
                  isDisabled={selectedTagKeys.length === 0}
                  onPress={() => setSelectedTagKeys([])}
                >
                  Clear
                </Button>
              </div>
              <div className="grid grid-cols-1 items-center gap-2 rounded-lg border border-default-200 bg-default-50/60 px-3 py-2 sm:grid-cols-[7rem_1fr_auto]">
                <span className="text-xs font-semibold uppercase tracking-wide text-default-600">
                  Professors
                </span>
                <div className="min-w-0 overflow-hidden">
                  <MultiSelect
                    placeholder="Any professor…"
                    options={professorFilterOptions}
                    value={selectedInstructorIds}
                    onChange={setSelectedInstructorIds}
                    showSearch
                  />
                </div>
                <Button
                  size="sm"
                  variant="light"
                  className="shrink-0 font-semibold"
                  isDisabled={selectedInstructorIds.length === 0}
                  onPress={() => setSelectedInstructorIds([])}
                >
                  Clear
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        {activeFilterCount > 0 && (
          <Button
            size="sm"
            radius="md"
            variant="light"
            className={editorFilterClearBtnClass}
            onPress={() => {
              setSelectedDepartmentKeys([]);
              setSelectedInstructorIds([]);
            }}
          >
            Clear all
          </Button>
        )}
        {departmentColorLegend.length > 0 && (
          <>
            <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
            <Popover
              isOpen={colorsExpanded}
              onOpenChange={(open) => {
                setColorsExpanded(open);
                if (!open) setHoveredDepartmentKey(null);
              }}
              placement="bottom-start"
              {...navbarPopoverProps}
            >
              <PopoverTrigger>
                <button
                  type="button"
                  aria-expanded={colorsExpanded}
                  className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Palette className="size-3.5 text-slate-400" aria-hidden />
                  <span className="uppercase tracking-wider text-[10px] text-slate-500">Colors</span>
                  {selectedLegendDepartmentKeys.length > 0 ? (
                    <span className="text-slate-400">{selectedLegendDepartmentKeys.length}/{departmentColorLegend.length}</span>
                  ) : (
                    <span className="text-slate-400">{departmentColorLegend.length}</span>
                  )}
                  <ChevronDown
                    className={clsx(
                      "size-3.5 text-slate-400 transition-transform",
                      colorsExpanded && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent className={toolbarChipPopoverContentClass}>
                <div
                  ref={colorsGridRef}
                  className={clsx(toolbarChipPopoverGridClass, "p-3")}
                  style={toolbarChipPopoverGridStyle(departmentColorLegend.length)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {departmentColorLegend.map((item) => {
                    const isActive = selectedLegendDepartmentKeys.includes(item.colorKey);
                    return (
                      <button
                        key={item.colorKey}
                        type="button"
                        role="checkbox"
                        aria-checked={isActive}
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
                          toolbarChipPopoverChipClass,
                          isActive
                            ? "border-sky-200/90 bg-sky-50 text-weatherhead-primary"
                            : "border-slate-200/80 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50",
                        )}
                      >
                        <span
                          className="h-2.5 w-4 shrink-0 rounded border-l-[2px] border border-slate-300/70"
                          style={{
                            backgroundColor: item.swatch.cardBg,
                            backgroundImage: item.swatch.cardPattern,
                            borderLeftColor: item.swatch.cardBorder,
                          }}
                          aria-hidden
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}
        {crosslistGroupLegend.length > 0 && (
          <>
            <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
            <Popover
              isOpen={crosslistExpanded}
              onOpenChange={setCrosslistExpanded}
              placement="bottom-start"
              {...navbarPopoverProps}
            >
              <PopoverTrigger>
                <button
                  type="button"
                  aria-expanded={crosslistExpanded}
                  className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Link2 className="size-3.5 text-slate-400" aria-hidden />
                  <span className="uppercase tracking-wider text-[10px] text-slate-500">Crosslist</span>
                  <span className="text-slate-400">{crosslistGroupLegend.length}</span>
                  <ChevronDown
                    className={clsx(
                      "size-3.5 text-slate-400 transition-transform",
                      crosslistExpanded && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent className={toolbarChipPopoverContentClass}>
                <div
                  ref={crosslistGridRef}
                  className={clsx(toolbarChipPopoverGridClass, "p-3")}
                  style={toolbarChipPopoverGridStyle(crosslistGroupLegend.length)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {crosslistGroupLegend.map((item) => (
                    <button
                      key={item.groupId}
                      type="button"
                      onClick={() => {
                        setCrosslistExpanded(false);
                        openCrosslistGroupPicker(item.groupId, item.members);
                      }}
                      className={clsx(
                        toolbarChipPopoverChipClass,
                        "border-slate-200/80 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      <CrosslistLegendSwatch swatch={item.swatch} />
                      <span className="truncate">
                        {item.groupId}
                        <span className="text-slate-400"> ({item.members.length})</span>
                      </span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}
        <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
        <div className="ml-auto shrink-0">
          <Button
            size="sm"
            radius="md"
            className="h-8 min-h-8 gap-1 px-3 text-xs font-semibold text-weatherhead-primary bg-sky-50/60 border border-sky-200/50 data-[hover=true]:bg-sky-100/80 shadow-none"
            startContent={<Plus className="size-3.5" aria-hidden />}
            onPress={openCreateSectionModal}
          >
            Add Section
          </Button>
        </div>
      </div>



      {/* Main calendar grid + queue */}
      <div className="flex min-h-[600px] max-h-[calc(100dvh-10rem)]">
        <SectionQueueSidebar
          open={queueSidebarOpen}
          onToggleOpen={() => setQueueSidebarOpen((v) => !v)}
          onRequestOpen={autoOpenQueueSidebar}
          sidebarRef={queueSidebarRef}
          sections={queueSectionRows}
          editorInvalidatedPlacements={editorInvalidatedPlacements}
          ghostSectionIds={ghostSectionIds}
          activeDragSectionId={pendingPlacementSectionId}
          onBeginPlace={(sectionId: string) => {
            const invalidation = editorInvalidatedPlacements.get(sectionId);
            if (invalidation?.reason === "pattern") {
              setDragFeedback({
                status: "invalid",
                message: "Update allowed meeting patterns in the editor before placing.",
              });
              return;
            }
            placementCommittedRef.current = false;
            const section = data?.sections.find((s) => s.id === sectionId);
            const online = section ? isOnlineSection(section) : false;
            const archived = section ? isSectionArchived(section) : false;
            setPendingPlacementSectionId(sectionId);
            setQueueDragSectionId(sectionId);
            const placeHint = online
              ? "Drag or hover over a highlighted slot in the Online band, then click or drop to place. Esc to cancel."
              : "Drag or hover over a highlighted slot, then click or drop to place. Esc to cancel.";
            setDragFeedback({
              status: "neutral",
              message: archived
                ? `Placing will reactivate this archived section on the calendar. ${placeHint}`
                : placeHint,
            });
          }}
          onEditSection={openSectionEditor}
          onPlacementDragEnd={() => {
            if (!placementCommittedRef.current) {
              cancelPlacementMode();
            }
          }}
          onDropUnplace={handleQueueSidebarUnplaceDrop}
        />
      <div
        className={clsx(
          "flex-1 min-w-0 rounded-xl border shadow-lg overflow-hidden flex flex-col",
          dragFeedback.status === "invalid"
            ? "bg-red-50/40 border-red-200"
            : dragFeedback.status === "valid"
              ? "bg-emerald-50/35 border-emerald-200"
            : "bg-white border-slate-200",
        )}
      >
        {pendingPlacementSectionId && data ? (
          <div className="flex items-center justify-between gap-3 border-b border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-900">
            <span>
              Placing{" "}
              <span className="font-bold">
                {(() => {
                  const s = data.sections.find((x) => x.id === pendingPlacementSectionId);
                  if (!s) return pendingPlacementSectionId;
                  return [s.department, s.course_id].filter(Boolean).join(" ");
                })()}
              </span>
              — click a highlighted slot or press Esc to cancel
            </span>
            <button
              type="button"
              className="shrink-0 rounded-md border border-sky-300 bg-white px-2 py-1 text-[11px] font-bold text-sky-800 hover:bg-sky-100"
              onClick={cancelPlacementMode}
            >
              Cancel
            </button>
          </div>
        ) : null}
        <div className="flex bg-slate-50 border-b border-slate-200">
          <div className="w-40 flex-shrink-0 border-r border-slate-200 px-3 py-3 flex items-center justify-between gap-1">
            <span className="font-bold text-[10px] uppercase text-slate-500 tracking-widest">
              Rooms \ Time
            </span>
            <Popover
              isOpen={roomSortExpanded}
              onOpenChange={setRoomSortExpanded}
              placement="bottom-start"
              {...navbarPopoverProps}
              shouldCloseOnInteractOutside={toolbarPanelCloseOnInteractOutside}
            >
              <PopoverTrigger>
                <button
                  type="button"
                  aria-expanded={roomSortExpanded}
                  aria-label="Room order"
                  title="Room order"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                >
                  <ArrowUpDown className="size-3" aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className={toolbarCompactPopoverContentClass}
                aria-label="Room order"
              >
                <div
                  ref={roomSortPanelRef}
                  className="max-h-[min(50vh,320px)] space-y-1 overflow-y-auto p-2"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Room order
                  </p>
                  {CALENDAR_ROOM_SORT_OPTIONS.map((opt) => {
                    const selected = roomSortMode === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={clsx(
                          "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs font-semibold transition-colors",
                          selected
                            ? "bg-sky-50 text-weatherhead-primary"
                            : "text-slate-700 hover:bg-slate-50",
                        )}
                        onClick={() => {
                          setRoomSortMode(opt.value);
                          writeCalendarRoomSortMode(opt.value);
                          setRoomSortExpanded(false);
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
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
                  className="relative overflow-visible border-b border-slate-200/80 last:border-b-0 z-0 has-[[data-calendar-hover=true]]:z-30"
                  style={{ minHeight: rowHeight }}
                  onDragOver={(e) => {
                    if (!pendingPlacementSectionId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    updateQueueRoomPlacementPreview(room.id, e.clientX);
                  }}
                  onDrop={(e) => {
                    if (!pendingPlacementSectionId || !data) return;
                    e.preventDefault();
                    const sectionId = e.dataTransfer.getData("text/section-id");
                    if (sectionId && sectionId !== pendingPlacementSectionId) return;
                    const mins = minutesFromPointerInRoom(e.clientX, room.id);
                    if (mins === null) return;
                    const allowedDurations = getAllowedSlotDurationsForQueuePlacement(
                      pendingPlacementSectionId,
                      data,
                      solverInput ?? null,
                      selectedDay,
                      timeslotById,
                    );
                    const slot = selectSlotNearMinutes(
                      data.timeslots,
                      selectedDay,
                      allowedDurations,
                      mins,
                    );
                    if (!slot) return;
                    commitPlacementByClick(pendingPlacementSectionId, room.id, slot);
                  }}
                  onPointerMove={(e) => {
                    updateQueueRoomPlacementPreview(room.id, e.clientX);
                  }}
                  onPointerLeave={() => {
                    if (!pendingPlacementSectionId || calendarDrag) return;
                    setPlacementPreview(null);
                    setDragFeedback({
                      status: "neutral",
                      message:
                        "Hover over a highlighted slot to place. Press Esc to cancel.",
                    });
                  }}
                  onClick={(e) => {
                    if (!pendingPlacementSectionId || calendarDrag || !data) return;
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
                    const allowedDurations = getAllowedSlotDurationsForQueuePlacement(
                      pendingPlacementSectionId,
                      data,
                      solverInput ?? null,
                      selectedDay,
                      timeslotById,
                    );
                    const slot = selectSlotNearMinutes(
                      data.timeslots,
                      selectedDay,
                      allowedDurations,
                      mins,
                    );
                    if (!slot) return;
                    commitPlacementByClick(pendingPlacementSectionId, room.id, slot);
                  }}
                >
                  {pendingPlacementSectionId &&
                    queuePlacementPossibleTimeslots
                      .filter((slot) => slot.end > axisStart && slot.start < axisEnd)
                      .map((slot) => {
                        const durationMin = Math.max(0, slot.end - slot.start);
                        const blockedKey = `${room.id}::${slot.id}`;
                        const isBlocked = queueBlockedTimeslotInfo.blockedSlotIds.has(blockedKey);
                        const blockedReason =
                          queueBlockedTimeslotInfo.blockedReasonBySlotId.get(blockedKey);
                        const leftPct =
                          (clamp(slot.start, axisStart, axisEnd) - axisStart) / axisRange;
                        const widthPct =
                          (clamp(slot.end, axisStart, axisEnd) -
                            clamp(slot.start, axisStart, axisEnd)) /
                          axisRange;
                        return (
                          <div
                            key={`${room.id}-queue-band-${slot.id}`}
                            className="absolute top-0 bottom-0 pointer-events-none"
                            style={{
                              left: `${leftPct * 100}%`,
                              width: `${Math.max(widthPct * 100, 0.5)}%`,
                              backgroundColor: isBlocked
                                ? "rgba(220, 38, 38, 0.2)"
                                : rgbaFillForTimeslotDuration(durationMin, "strong"),
                              backgroundImage: isBlocked
                                ? "repeating-linear-gradient(135deg, rgba(220,38,38,0.38) 0px, rgba(220,38,38,0.38) 5px, rgba(255,255,255,0.0) 5px, rgba(255,255,255,0.0) 10px)"
                                : undefined,
                              outline: isBlocked ? "1px solid rgba(220, 38, 38, 0.75)" : undefined,
                              zIndex: 0,
                            }}
                            title={
                              blockedReason ??
                              `${formatTimeAmPm(slot.start_time)}–${formatTimeAmPm(slot.end_time)} (${durationMin} min)`
                            }
                          />
                        );
                      })}
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
                    const matchesSearch = !hasSearch || (matchingSectionIds?.has(section.id) ?? true);
                    const matchesAllFilters = matchesHoveredDepartment && matchesSearch;
                    return (
                      <div
                        key={`${room.id}-${section.id}-occupied`}
                        className={clsx(
                          "absolute z-[6] rounded-lg border border-dashed pointer-events-none transition-all",
                          matchesAllFilters
                            ? "border-slate-300 bg-slate-100/70"
                            : "border-slate-200 bg-slate-100/35 opacity-45",
                          (activeLegendDepartmentKeys.size > 0 || hasSearch) &&
                            matchesAllFilters &&
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
                    const matchesSearch = !hasSearch || (matchingSectionIds?.has(section.id) ?? true);
                    const matchesAllFilters = matchesHoveredDepartment && matchesSearch;
                    const dragSectionId = isCrosslistGroupEvent(event)
                      ? section.id
                      : section.id;
                    const isDragSource =
                      calendarDrag?.sectionId === dragSectionId ||
                      (queueUnplaceDrag?.sectionId === dragSectionId && queueUnplaceDrag.hasMoved);
                    const cardFaceTitle =
                      isCrosslistGroupEvent(event) && event.crosslistGroupId
                        ? event.crosslistGroupId
                        : `${section.department} ${section.course_id}`;
                    const cardProfessor = isCrosslistGroupEvent(event)
                      ? `${(event.crosslistMembers ?? []).length} cross-listed sections`
                      : (instructorById.get(section.instructor_id)?.name ??
                        section.instructor_id ??
                        "—");
                    const lockState: SectionLockState = isCrosslistGroupEvent(event)
                      ? (event.crosslistMembers ?? []).some((member) =>
                          getSectionLockState(member.id) !== "none",
                        )
                        ? (event.crosslistMembers ?? []).some((member) =>
                            getSectionLockState(member.id) === "hard",
                          )
                          ? "hard"
                          : "soft"
                        : "none"
                      : getSectionLockState(section.id);

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
                        // Freeze calendar edits while any user is running the solver.
                        if (solverLock.active) {
                          setCalendarDrag(null);
                          setDragFeedback({
                            status: "invalid",
                            message: solverLock.startedBy
                              ? `Solver is running (started by ${solverLock.startedBy}). Wait for it to finish before editing.`
                              : "Solver is running. Wait for it to finish before editing.",
                          });
                          return;
                        }
                        // Locked placements (or any locked cross-list peer) must not
                        // start a drag — corruption guard for solver-pinned sections.
                        if (lockState !== "none") {
                          setCalendarDrag(null);
                          setDragFeedback({
                            status: "invalid",
                            message:
                              "This section is locked for the solver. Unlock it in the schedule table to move it.",
                          });
                          return;
                        }
                        if (e.shiftKey) {
                          calendarDragPointerYRef.current = e.clientY;
                          const targetEl = e.currentTarget;
                          targetEl.setPointerCapture(e.pointerId);
                          setConflictSectionIds(new Set());
                          setBackendSaveMessage(null);
                          queueSidebarAutoOpenedRef.current = false;
                          sidebarUnplaceDropSucceededRef.current = false;
                          setQueueUnplaceDrag({
                            sectionId: dragSectionId,
                            pointerId: e.pointerId,
                            startX: e.clientX,
                            startY: e.clientY,
                            hasMoved: false,
                            clientX: e.clientX,
                            clientY: e.clientY,
                            faceTitle: cardFaceTitle,
                            professor: cardProfessor,
                            cardBg: color.cardBg,
                            cardBorder: color.cardBorder,
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
                          origin: "grid",
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
                        if (prev.origin === "online") return keepHasMoved();
                        const draggedE = findCalendarEventBySectionId(allDayEvents, prev.sectionId);
                        if (!draggedE) return keepHasMoved();
                        if (isPointerOverOnlineBand(e.clientX, e.clientY)) {
                          const draggedSection = data.sections.find(
                            (s) => s.id === prev.sectionId,
                          );
                          if (draggedSection && !isOnlineSection(draggedSection)) {
                            keepHasMoved();
                            setDragFeedback({
                              status: "invalid",
                              message:
                                "To place online, unplace this section to the queue sidebar first, then drag it to the Online band.",
                            });
                            return;
                          }
                        }
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
                            const onlineRect = onlineBandTrackRef.current?.getBoundingClientRect();
                            const overOnlineBand =
                              onlineRect &&
                              e.clientY >= onlineRect.top &&
                              e.clientY <= onlineRect.bottom &&
                              e.clientX >= onlineRect.left &&
                              e.clientX <= onlineRect.right;
                            if (overOnlineBand) {
                              const draggedSection = data?.sections.find(
                                (s) => s.id === prev.sectionId,
                              );
                              if (draggedSection && !isOnlineSection(draggedSection)) {
                                setDragFeedback({
                                  status: "invalid",
                                  message:
                                    "To place online, unplace this section to the queue sidebar first, then drag it to the Online band.",
                                });
                                return null;
                              }
                            }
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
                          matchesHoveredDepartment={matchesAllFilters}
                          hasActiveFilter={activeLegendDepartmentKeys.size > 0 || hasSearch}
                          isDragSource={isDragSource}
                          hasDragMoved={
                            Boolean(calendarDrag?.hasMoved) ||
                            Boolean(
                              queueUnplaceDrag?.sectionId === dragSectionId &&
                                queueUnplaceDrag?.hasMoved,
                            )
                          }
                          placementLocked={lockState}
                          draggable={Boolean(solverInput)}
                          lockable={Boolean(solverInput)}
                          isStaggered={sectionIsStaggered(section.id)}
                          onToggleLock={(e) => requestToggleLockFromCalendar(section.id, e?.shiftKey)}
                          isConflicting={event.crosslistMembers.some((member) =>
                            conflictSectionIds.has(member.id),
                          )}
                          queueDragSectionId={dragSectionId}
                          onQueueDragBlocked={() =>
                            setDragFeedback({
                              status: "invalid",
                              message:
                                "This section is locked for the solver. Unlock it in the schedule table to move it.",
                            })
                          }
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
                    const hoverLines = formatCalendarSectionHoverLines(section, professor);

                    return (
                      <SoloCalendarEventCard
                        key={getCalendarEventKey(event, room.id)}
                        timeLabel={timeLabel}
                        faceTitle={title}
                        professor={professor}
                        hoverTitle={hoverLines.title}
                        hoverInstructor={hoverLines.instructor}
                        color={color}
                        matchesHoveredDepartment={matchesAllFilters}
                        hasActiveFilter={activeLegendDepartmentKeys.size > 0 || hasSearch}
                        isDragSource={isDragSource}
                        hasDragMoved={
                          Boolean(calendarDrag?.hasMoved) ||
                          Boolean(
                            queueUnplaceDrag?.sectionId === dragSectionId &&
                              queueUnplaceDrag?.hasMoved,
                          )
                        }
                        placementLocked={lockState}
                        draggable={Boolean(solverInput)}
                        lockable={Boolean(solverInput)}
                        isStaggered={isStaggered}
                        onToggleLock={(e?: ReactMouseEvent<HTMLButtonElement>) =>
                          requestToggleLockFromCalendar(section.id, e?.shiftKey)
                        }
                        isConflicting={isConflicting}
                        queueDragSectionId={section.id}
                        onQueueDragBlocked={() =>
                          setDragFeedback({
                            status: "invalid",
                            message:
                              "This section is locked for the solver. Unlock it in the schedule table to move it.",
                          })
                        }
                        style={{
                          left: `${leftPct * 100}%`,
                          width: `${Math.max(widthPct * 100, 0.5)}%`,
                          top,
                          height: EVENT_HEIGHT_PX,
                        }}
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
                      />
                    );
                  })}
                </div>
              ))}

              {calendarDrag?.hasMoved &&
                calendarDrag.origin === "grid" &&
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
                  const previewMatchesSearch = !hasSearch || (matchingSectionIds?.has(section.id) ?? true);
                  const previewMatchesAllFilters = previewMatchesHoveredDepartment && previewMatchesSearch;
                  return (
                    <div
                      key="calendar-drag-preview"
                      className={clsx(
                        "absolute pointer-events-none z-[25] border-l-4 rounded-lg p-2.5 flex flex-col justify-between shadow-sm ring-2 ring-inset",
                        previewBlocked ? "ring-red-500/65" : "ring-[#137fec]/40",
                        !previewMatchesAllFilters && "opacity-35",
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
                      <div className="font-black text-[10px] truncate text-slate-900">
                        {ttlPv}
                      </div>
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

          {onlineDayEvents.length > 0 ||
          (pendingPlacementSectionId &&
            data?.sections.some(
              (s) => s.id === pendingPlacementSectionId && isOnlineSection(s),
            )) ? (
            <div className="border-t border-violet-200 bg-violet-50/40">
              <div className="flex border-b border-violet-200/80 bg-violet-100/50">
                <div className="w-40 shrink-0 border-r border-violet-200 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-violet-800">
                  Online
                </div>
                <div className="flex flex-1">
                  {timeAxisLabels.map((t) => (
                    <div
                      key={`online-axis-${t}`}
                      className="flex-1 border-r border-violet-200/60 p-2 text-center text-[10px] font-bold text-violet-700/80"
                    >
                      {t}
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative" style={{ minHeight: onlineBandTrackHeight }}>
                <div className="absolute inset-y-0 left-0 w-40 border-r border-violet-200/80 bg-violet-50/60" />
                <div
                  ref={onlineBandTrackRef}
                  className="relative ml-40 pointer-events-auto"
                  style={{ minHeight: onlineBandTrackHeight }}
                  onDragOver={(e) => {
                    if (!pendingPlacementSectionId || !data) return;
                    const pendingSection = data.sections.find(
                      (s) => s.id === pendingPlacementSectionId,
                    );
                    if (!pendingSection || !isOnlineSection(pendingSection)) {
                      e.dataTransfer.dropEffect = "none";
                      setDragFeedback({
                        status: "invalid",
                        message:
                          "Only online sections (800–899) can be placed in the Online band. Unplace to the queue sidebar first.",
                      });
                      return;
                    }
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    updateQueueOnlinePlacementPreview(e.clientX);
                  }}
                  onDrop={(e) => {
                    if (!pendingPlacementSectionId || !data) return;
                    e.preventDefault();
                    const pendingSection = data.sections.find(
                      (s) => s.id === pendingPlacementSectionId,
                    );
                    if (!pendingSection || !isOnlineSection(pendingSection)) {
                      setDragFeedback({
                        status: "invalid",
                        message:
                          "Only online sections (800–899) can be placed in the Online band. Unplace to the queue sidebar first.",
                      });
                      return;
                    }
                    const sectionId = e.dataTransfer.getData("text/section-id");
                    if (sectionId && sectionId !== pendingPlacementSectionId) return;
                    const mins = minutesFromPointerInOnlineBand(e.clientX);
                    if (mins === null) return;
                    const allowedDurations = getAllowedSlotDurationsForQueuePlacement(
                      pendingPlacementSectionId,
                      data,
                      solverInput ?? null,
                      selectedDay,
                      timeslotById,
                    );
                    const slot = selectSlotNearMinutes(
                      data.timeslots,
                      selectedDay,
                      allowedDurations,
                      mins,
                    );
                    if (!slot) return;
                    commitOnlinePlacementByClick(pendingPlacementSectionId, slot);
                  }}
                  onPointerMove={(e) => {
                    if (calendarDrag?.origin === "online") return;
                    updateQueueOnlinePlacementPreview(e.clientX);
                  }}
                  onPointerLeave={() => {
                    if (!pendingPlacementSectionId || calendarDrag) return;
                    const pendingSection = data?.sections.find(
                      (s) => s.id === pendingPlacementSectionId,
                    );
                    if (!pendingSection || !isOnlineSection(pendingSection)) return;
                    setPlacementPreview(null);
                    setDragFeedback({
                      status: "neutral",
                      message:
                        "Hover over a highlighted slot to place. Press Esc to cancel.",
                    });
                  }}
                  onClick={(e) => {
                    if (!pendingPlacementSectionId || calendarDrag || !data) return;
                    const pendingSection = data.sections.find(
                      (s) => s.id === pendingPlacementSectionId,
                    );
                    if (!pendingSection || !isOnlineSection(pendingSection)) return;
                    if (placementPreview && placementPreview.targetRoomId === "") {
                      const previewSlot = timeslotById.get(placementPreview.slotId);
                      if (!previewSlot) return;
                      commitOnlinePlacementByClick(pendingPlacementSectionId, {
                        ...previewSlot,
                        start: placementPreview.startMin,
                        end: placementPreview.endMin,
                      });
                      return;
                    }
                    const mins = minutesFromPointerInOnlineBand(e.clientX);
                    if (mins === null) return;
                    const allowedDurations = getAllowedSlotDurationsForQueuePlacement(
                      pendingPlacementSectionId,
                      data,
                      solverInput ?? null,
                      selectedDay,
                      timeslotById,
                    );
                    const slot = selectSlotNearMinutes(
                      data.timeslots,
                      selectedDay,
                      allowedDurations,
                      mins,
                    );
                    if (!slot) return;
                    commitOnlinePlacementByClick(pendingPlacementSectionId, slot);
                  }}
                >
                  <div
                    className="absolute inset-0 grid pointer-events-none z-[1]"
                    style={{ gridTemplateColumns: `repeat(${hourSegments}, minmax(0, 1fr))` }}
                  >
                    {Array.from({ length: hourSegments }).map((_, j) => (
                      <div
                        key={`online-grid-${j}`}
                        className="border-r border-violet-300/50 last:border-r-0"
                      />
                    ))}
                  </div>
                  {calendarDrag?.origin === "online" &&
                    calendarDrag.hasMoved &&
                    onlineDragPossibleTimeslotBoundaries.map((minute) => {
                      const leftPct = ((minute - axisStart) / axisRange) * 100;
                      return (
                        <div
                          key={`online-boundary-${minute}`}
                          className="absolute top-0 bottom-0 border-l border-red-300/70 pointer-events-none"
                          style={{ left: `${leftPct}%`, zIndex: 2 }}
                        />
                      );
                    })}
                  {calendarDrag?.origin === "online" &&
                    calendarDrag.hasMoved &&
                    onlineDragPossibleTimeslots
                      .filter((slot) => slot.end > axisStart && slot.start < axisEnd)
                      .map((slot) => {
                        const durationMin = Math.max(0, slot.end - slot.start);
                        const isBlocked = onlineDragBlockedTimeslotInfo.blockedSlotIds.has(
                          slot.id,
                        );
                        const blockedReason =
                          onlineDragBlockedTimeslotInfo.blockedReasonBySlotId.get(slot.id);
                        const leftPct =
                          (clamp(slot.start, axisStart, axisEnd) - axisStart) / axisRange;
                        const widthPct =
                          (clamp(slot.end, axisStart, axisEnd) -
                            clamp(slot.start, axisStart, axisEnd)) /
                          axisRange;
                        return (
                          <div
                            key={`online-drag-band-${slot.id}`}
                            className="absolute top-0 bottom-0 pointer-events-none"
                            style={{
                              left: `${leftPct * 100}%`,
                              width: `${Math.max(widthPct * 100, 0.5)}%`,
                              backgroundColor: isBlocked
                                ? "rgba(220, 38, 38, 0.2)"
                                : rgbaFillForTimeslotDuration(durationMin, "strong"),
                              backgroundImage: isBlocked
                                ? "repeating-linear-gradient(135deg, rgba(220,38,38,0.38) 0px, rgba(220,38,38,0.38) 5px, rgba(255,255,255,0.0) 5px, rgba(255,255,255,0.0) 10px)"
                                : undefined,
                              outline: isBlocked ? "1px solid rgba(220, 38, 38, 0.75)" : undefined,
                              zIndex: 0,
                            }}
                            title={
                              blockedReason ??
                              `${formatTimeAmPm(slot.start_time)}–${formatTimeAmPm(slot.end_time)} (${durationMin} min)`
                            }
                          />
                        );
                      })}
                  {pendingPlacementSectionId &&
                    data?.sections.some(
                      (s) => s.id === pendingPlacementSectionId && isOnlineSection(s),
                    ) &&
                    onlineQueuePlacementPossibleTimeslots
                      .filter((slot) => slot.end > axisStart && slot.start < axisEnd)
                      .map((slot) => {
                        const durationMin = Math.max(0, slot.end - slot.start);
                        const isBlocked = onlineQueueBlockedTimeslotInfo.blockedSlotIds.has(
                          slot.id,
                        );
                        const blockedReason =
                          onlineQueueBlockedTimeslotInfo.blockedReasonBySlotId.get(slot.id);
                        const leftPct =
                          (clamp(slot.start, axisStart, axisEnd) - axisStart) / axisRange;
                        const widthPct =
                          (clamp(slot.end, axisStart, axisEnd) -
                            clamp(slot.start, axisStart, axisEnd)) /
                          axisRange;
                        return (
                          <div
                            key={`online-queue-band-${slot.id}`}
                            className="absolute top-0 bottom-0 pointer-events-none"
                            style={{
                              left: `${leftPct * 100}%`,
                              width: `${Math.max(widthPct * 100, 0.5)}%`,
                              backgroundColor: isBlocked
                                ? "rgba(220, 38, 38, 0.2)"
                                : rgbaFillForTimeslotDuration(durationMin, "strong"),
                              backgroundImage: isBlocked
                                ? "repeating-linear-gradient(135deg, rgba(220,38,38,0.38) 0px, rgba(220,38,38,0.38) 5px, rgba(255,255,255,0.0) 5px, rgba(255,255,255,0.0) 10px)"
                                : undefined,
                              outline: isBlocked ? "1px solid rgba(220, 38, 38, 0.75)" : undefined,
                              zIndex: 0,
                            }}
                            title={
                              blockedReason ??
                              `${formatTimeAmPm(slot.start_time)}–${formatTimeAmPm(slot.end_time)} (${durationMin} min)`
                            }
                          />
                        );
                      })}
                  {pendingPlacementSectionId &&
                    placementPreview &&
                    placementPreview.targetRoomId === "" &&
                    (() => {
                      const section = data?.sections.find(
                        (s) => s.id === pendingPlacementSectionId,
                      );
                      if (!section) return null;
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
                        departmentPaletteByKey.get(departmentColorKey(section)) ??
                        solidPaletteAt(0);
                      return (
                        <div
                          key={`online-placement-preview-${pendingPlacementSectionId}`}
                          className="absolute z-[24] pointer-events-none border-l-4 rounded-lg px-2 py-1 shadow-sm"
                          style={{
                            left: `${leftPct * 100}%`,
                            width: `${Math.max(widthPct * 100, 0.5)}%`,
                            top: onlineEventTopPx(0),
                            height: EVENT_HEIGHT_PX,
                            backgroundColor: bg,
                            borderLeftColor: color.cardBorder,
                            outline: `2px solid ${border}`,
                          }}
                        >
                          <div className="truncate text-[9px] font-black text-slate-900">
                            {(section.department ? `${section.department} ` : "") + section.course_id}
                          </div>
                          <div className="truncate text-[8px] text-slate-600">
                            {placementPreview.isValid ? "Click to place" : "Cannot place here"}
                          </div>
                        </div>
                      );
                    })()}
                  {calendarDrag?.origin === "online" &&
                    calendarDrag.hasMoved &&
                    calendarDrag.preview.targetRoomId === "" &&
                    (() => {
                      const section = data?.sections.find((s) => s.id === calendarDrag.sectionId);
                      const st = timeslotById.get(calendarDrag.preview.slotId);
                      if (!section || !st) return null;
                      const leftPct =
                        (clamp(calendarDrag.preview.startMin, axisStart, axisEnd) - axisStart) /
                        axisRange;
                      const widthPct =
                        (clamp(calendarDrag.preview.endMin, axisStart, axisEnd) -
                          clamp(calendarDrag.preview.startMin, axisStart, axisEnd)) /
                        axisRange;
                      const previewBlocked = onlineDragBlockedTimeslotInfo.blockedSlotIds.has(
                        st.id,
                      );
                      const color =
                        departmentPaletteByKey.get(departmentColorKey(section)) ??
                        solidPaletteAt(0);
                      const inst = instructorById.get(section.instructor_id);
                      const professor = inst?.name ?? section.instructor_id ?? "—";
                      return (
                        <div
                          key="online-drag-preview"
                          className={clsx(
                            "absolute z-[25] pointer-events-none border-l-4 rounded-lg px-2 py-1 shadow-sm ring-2 ring-inset",
                            previewBlocked ? "ring-red-500/65" : "ring-[#137fec]/40",
                          )}
                          style={{
                            left: `${leftPct * 100}%`,
                            width: `${Math.max(widthPct * 100, 0.5)}%`,
                            top: onlineEventTopPx(calendarDrag.originLane),
                            height: EVENT_HEIGHT_PX,
                            backgroundColor: color.cardBg,
                            borderLeftColor: color.cardBorder,
                          }}
                        >
                          <div className="truncate text-[9px] font-black text-slate-900">
                            {(section.department ? `${section.department} ` : "") + section.course_id}
                          </div>
                          <div className="truncate text-[8px] text-slate-600">{professor}</div>
                        </div>
                      );
                    })()}
                  {onlineDayEvents.map((event) => {
                    const { section, timeslot, start, end, lane } = event;
                    if (!timeslot) return null;
                    const eventLane = lane ?? 0;
                    const inst = instructorById.get(section.instructor_id);
                    const professor = inst?.name ?? section.instructor_id ?? "—";
                    const hoverLines = formatCalendarSectionHoverLines(section, professor);
                    const leftPct = (event.start - axisStart) / axisRange;
                    const widthPct = (event.end - event.start) / axisRange;
                    const topPx = onlineEventTopPx(eventLane);
                    const color =
                      departmentPaletteByKey.get(departmentColorKey(section)) ??
                      solidPaletteAt(0);
                    const dragSectionId = section.id;
                    const isDragSource = calendarDrag?.sectionId === dragSectionId;
                    const lockState = getSectionLockState(section.id);
                    const isConflicting = conflictSectionIds.has(section.id);
                    return (
                      <div
                        key={`online-${section.id}`}
                        className={clsx(
                          "absolute z-[10] rounded-lg border-l-4 px-2 py-1 shadow-sm touch-none select-none overflow-hidden",
                          isDragSource && calendarDrag?.hasMoved && "opacity-40",
                          isConflicting && "ring-2 ring-red-500/70",
                        )}
                        style={{
                          left: `${leftPct * 100}%`,
                          width: `${Math.max(widthPct * 100, 0.5)}%`,
                          top: topPx,
                          height: EVENT_HEIGHT_PX,
                          backgroundColor: color.cardBg,
                          borderLeftColor: color.cardBorder,
                        }}
                        title={`${hoverLines.title} — ${hoverLines.instructor}`}
                        onPointerDown={(e) => {
                          if (!solverInput || e.button !== 0) return;
                          e.stopPropagation();
                          e.preventDefault();
                          if (solverLock.active) {
                            setCalendarDrag(null);
                            setDragFeedback({
                              status: "invalid",
                              message: solverLock.startedBy
                                ? `Solver is running (started by ${solverLock.startedBy}). Wait for it to finish before editing.`
                                : "Solver is running. Wait for it to finish before editing.",
                            });
                            return;
                          }
                          if (lockState !== "none") {
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
                            origin: "online",
                            originLane: eventLane,
                            preview: {
                              targetRoomId: "",
                              slotId: timeslot.id,
                              startMin: start,
                              endMin: end,
                            },
                          });
                        }}
                        onPointerMove={(e) => {
                          const prev = calendarDrag;
                          if (!prev || e.pointerId !== prev.pointerId || prev.origin !== "online")
                            return;
                          const dist = Math.hypot(e.clientX - prev.startX, e.clientY - prev.startY);
                          const hasMoved =
                            prev.hasMoved || dist > CALENDAR_DRAG_MOVE_THRESHOLD_PX;
                          const keepHasMoved = () => {
                            if (hasMoved !== prev.hasMoved) {
                              setCalendarDrag({ ...prev, hasMoved });
                            }
                          };
                          if (!data) return keepHasMoved();
                          if (!isPointerOverOnlineBand(e.clientX, e.clientY)) {
                            keepHasMoved();
                            setDragFeedback({
                              status: "invalid",
                              message:
                                "Online sections stay in the Online band — drop on a highlighted slot.",
                            });
                            return;
                          }
                          const allowedDurations = getAllowedSlotDurationsForDrag(
                            prev.sectionId,
                            assignmentsBySection,
                            data,
                            solverInput ?? null,
                            selectedDay,
                            timeslotById,
                            onlineDayEvents,
                          );
                          const mins = minutesFromPointerInOnlineBand(e.clientX);
                          if (mins === null) return keepHasMoved();
                          const slot = selectSlotNearMinutes(
                            data.timeslots,
                            selectedDay,
                            allowedDurations,
                            mins,
                          );
                          if (!slot) {
                            keepHasMoved();
                            setDragFeedback({
                              status: "invalid",
                              message:
                                "No compatible slot here for this section's meeting length.",
                            });
                            return;
                          }
                          const check = evaluateOnlinePlacement(prev.sectionId, slot);
                          setDragFeedback({
                            status:
                              check.severity === "block"
                                ? "invalid"
                                : check.severity === "warn"
                                  ? "warning"
                                  : "valid",
                            message: check.message,
                          });
                          setCalendarDrag({
                            ...prev,
                            hasMoved,
                            preview: {
                              targetRoomId: "",
                              slotId: slot.id,
                              startMin: slot.start,
                              endMin: slot.end,
                            },
                          });
                        }}
                        onPointerUp={(e) => {
                          setCalendarDrag((prev) => {
                            if (!prev || e.pointerId !== prev.pointerId || prev.origin !== "online")
                              return prev;
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
                              const overOnlineBand = isPointerOverOnlineBand(
                                e.clientX,
                                e.clientY,
                              );
                              if (!overOnlineBand) {
                                setDragFeedback({
                                  status: "invalid",
                                  message:
                                    "Online sections stay in the Online band — drop on a highlighted slot.",
                                });
                                return null;
                              }
                              const slotFull = timeslotById.get(prev.preview.slotId);
                              if (slotFull) {
                                commitOnlineCalendarPlacement(prev.sectionId, {
                                  ...slotFull,
                                  start: prev.preview.startMin,
                                  end: prev.preview.endMin,
                                });
                              }
                            }
                            return null;
                          });
                        }}
                        onPointerCancel={(e) => {
                          setCalendarDrag((prev) => {
                            if (!prev || e.pointerId !== prev.pointerId) return prev;
                            try {
                              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                            } catch {
                              /* noop */
                            }
                            return null;
                          });
                        }}
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
                        <div className="truncate text-[9px] font-black text-slate-900">
                          {hoverLines.title}
                        </div>
                        <div className="truncate text-[8px] text-slate-600">{professor}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      </div>
      </div>

      {orphanModalSections.length > 0 ? (
        <OrphanSectionsModal
          sections={orphanModalSections.map((s) => ({
            id: s.id,
            department: s.department,
            course_id: s.course_id,
            section_code: s.section_code,
            section_number: s.section_number,
            instructor_id: s.instructor_id,
            instructorName:
              instructorById.get(s.instructor_id)?.name?.trim() || s.instructor_id || "—",
          }))}
          onKeep={(ids) => resolveOrphanSections(ids, "keep")}
          onRemove={(ids) => resolveOrphanSections(ids, "remove")}
        />
      ) : null}

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
              Click to cycle: soft lock (preferred) → hard lock (required) → none. Cross-listed sections lock as a group. Shift+click hard-locks immediately.
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
          {hasAnyLock && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800">
              ·{" "}
              {[
                lockBreakdown.soft > 0 ? `${lockBreakdown.soft} soft locked` : null,
                lockBreakdown.hard > 0 ? `${lockBreakdown.hard} hard locked` : null,
              ]
                .filter(Boolean)
                .join(" and ")}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleAllLocks}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors",
                hasAnyLock
                  ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  : "border-red-200 bg-red-50 text-red-900 hover:bg-red-100",
              )}
              title={
                hasAnyLock
                  ? "Remove all locks from this calendar view"
                  : "Hard-lock every section that has both a room and times (cross-listed groups lock together)"
              }
            >
              {hasAnyLock ? (
                <Unlock className="size-3.5" />
              ) : (
                <Lock className="size-3.5" />
              )}
              {hasAnyLock ? "Unlock all" : "Lock all"}
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
                const lockState = getSectionLockState(section.id);
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
                  <tr
                    key={section.id}
                    className="hover:bg-slate-50/80 cursor-pointer"
                    onClick={() => {
                      setSectionModalError(null);
                      setSectionModal({
                        mode: "edit",
                        initialSectionId: section.id,
                        draft: toSectionFormDraft(section),
                      });
                    }}
                  >
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
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={lockState === "none" && !canLock}
                        onClick={(e) => cycleLockForSection(section.id, e.shiftKey)}
                        className={clsx(
                          "inline-flex items-center justify-center rounded-lg border p-2 transition-colors",
                          lockState === "hard"
                            ? "border-red-300 bg-red-50 text-red-900 hover:bg-red-100"
                            : lockState === "soft"
                              ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                              : canLock
                                ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300",
                        )}
                        title={
                          lockState === "hard"
                            ? "Hard-locked (click to unlock, shift+click for hard)"
                            : lockState === "soft"
                              ? "Soft-locked (click to hard-lock, shift+click for hard)"
                              : canLock
                                ? "Click to soft-lock, shift+click to hard-lock"
                                : "Set room and times before locking"
                        }
                        aria-label={
                          lockState === "hard"
                            ? "Hard-locked"
                            : lockState === "soft"
                              ? "Soft-locked"
                              : "Not locked"
                        }
                      >
                        {lockState === "hard" ? (
                          <Lock className="size-4" />
                        ) : lockState === "soft" ? (
                          <LockOpen className="size-4" />
                        ) : (
                          <Unlock className="size-4 opacity-40" />
                        )}
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

      {queueUnplaceDrag?.hasMoved &&
        dragFeedbackToastMount &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[80]"
            style={{
              left: queueUnplaceDrag.clientX,
              top: queueUnplaceDrag.clientY,
              transform: "translate(-50%, -50%)",
              width: 180,
            }}
          >
            <div
              className="rounded-lg border-l-4 p-2.5 shadow-lg"
              style={{
                backgroundColor: queueUnplaceDrag.cardBg,
                borderLeftColor: queueUnplaceDrag.cardBorder,
                opacity: 0.95,
              }}
            >
              <div className="truncate text-[10px] font-black text-slate-900">
                {queueUnplaceDrag.faceTitle}
              </div>
              <div className="truncate text-[9px] font-bold text-slate-700">
                {queueUnplaceDrag.professor}
              </div>
            </div>
          </div>,
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
              disabled={!canLockSectionPlacement(calendarContextMenu.sectionId)}
              onClick={() => cycleLockForSection(calendarContextMenu.sectionId, false)}
            >
              <LockOpen className="size-4 shrink-0 text-amber-600" aria-hidden />
              Soft lock (preferred)
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canLockSectionPlacement(calendarContextMenu.sectionId)}
              onClick={() => cycleLockForSection(calendarContextMenu.sectionId, true)}
            >
              <Lock className="size-4 shrink-0 text-red-600" aria-hidden />
              Hard lock (required)
            </button>
            {getSectionLockState(calendarContextMenu.sectionId) !== "none" ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => cycleLockForSection(calendarContextMenu.sectionId, false, "none")}
              >
                <Unlock className="size-4 shrink-0" aria-hidden />
                Remove lock
              </button>
            ) : null}
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
        closeOnBackdropClick={false}
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
                  <span className="text-xs font-semibold text-slate-600">ID *</span>
                  <input
                    className={`rounded-lg border border-slate-200 px-3 py-2 ${
                      sectionModal.mode === "edit" ? "cursor-not-allowed bg-slate-100 text-slate-400" : ""
                    }`}
                    value={sectionModal.draft.id}
                    onChange={(e) => updateSectionModalDraft("id", e.target.value)}
                    disabled={sectionModal.mode === "edit" || isSavingSection}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">SUBJ *</span>
                  <input
                    className="rounded-lg border border-slate-200 px-3 py-2"
                    value={sectionModal.draft.department}
                    onChange={(e) => updateSectionModalDraft("department", e.target.value)}
                    disabled={isSavingSection}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">Course *</span>
                  <input
                    className="rounded-lg border border-slate-200 px-3 py-2"
                    placeholder="Introduction to Accounting"
                    value={sectionModal.draft.course_id}
                    onChange={(e) => updateSectionModalDraft("course_id", e.target.value)}
                    disabled={isSavingSection}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">Code *</span>
                  <input
                    className="rounded-lg border border-slate-200 px-3 py-2"
                    placeholder="101"
                    value={sectionModal.draft.section_code}
                    onChange={(e) => updateSectionModalDraft("section_code", e.target.value)}
                    disabled={isSavingSection}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">Section Number</span>
                  <input
                    className="rounded-lg border border-slate-200 px-3 py-2"
                    placeholder="e.g. 1"
                    value={sectionModal.draft.section_number}
                    onChange={(e) => updateSectionModalDraft("section_number", e.target.value)}
                    disabled={isSavingSection}
                  />
                </label>
                {isOnlineSection({ section_number: sectionModal.draft.section_number }) ? (
                  <div className="sm:col-span-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
                    This section will appear in the Online band (no room). Change section number
                    manually to move between room and online scheduling.
                  </div>
                ) : null}
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">State</span>
                  <select
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                    value={normalizeSectionState(sectionModal.draft.state)}
                    onChange={(e) =>
                      updateSectionModalDraft("state", e.target.value as SectionState)
                    }
                    disabled={isSavingSection}
                  >
                    <option value="active">Active</option>
                    <option value="new">New</option>
                    <option value="archived">Archived</option>
                  </select>
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
                  <span className="text-xs font-semibold text-slate-600">Cap *</span>
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
                      Allowed Meeting Patterns
                    </span>
                    <MultiSelect
                      value={sectionModal.draft.allowed_meeting_patterns}
                      options={meetingPatternOptions}
                      onChange={(v) => updateSectionModalDraft("allowed_meeting_patterns", v)}
                      placeholder="Select patterns"
                    />
                  </label>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:col-span-2">
                    Meeting pattern selection happens after you place the new section on the calendar.
                  </div>
                )}
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-xs font-semibold text-slate-600">Room Req</span>
                  <CompactChipSelect
                    value={sectionModal.draft.room_requirements}
                    onChange={(v) => updateSectionModalDraft("room_requirements", v)}
                    suggestions={featureSuggestions}
                    placeholder="features"
                    ariaLabel="Room requirements"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">Crosslist</span>
                  <select
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                    value={sectionModal.draft.crosslist_group_id || "__none__"}
                    onChange={(e) =>
                      updateSectionModalDraft(
                        "crosslist_group_id",
                        e.target.value === "__none__" ? "" : e.target.value,
                      )
                    }
                    disabled={isSavingSection}
                  >
                    {crosslistOptionsWithNone.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-600">Tags</span>
                  <CompactChipSelect
                    value={sectionModal.draft.tags}
                    onChange={(v) => updateSectionModalDraft("tags", v)}
                    suggestions={tagSuggestions}
                    placeholder="tags"
                    ariaLabel="Tags"
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
                Section is placed
                {meetingPatternSelectionModal.roomId ? (
                  <>
                    {" "}
                    at room{" "}
                    <span className="font-semibold">{meetingPatternSelectionModal.roomId}</span>
                  </>
                ) : (
                  " in the Online band"
                )}
                . Choose a meeting pattern that includes this placed timeslot and maps the
                section to its additional days.
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
                    days with a conflict or no matching timeslot are called out below. Or choose{" "}
                    <span className="font-semibold">Keep staggered</span> to leave other days
                    unchanged.
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
                              <span className="text-xs text-slate-500">
                                {row.currentTimeLabel && row.currentTimeLabel !== row.timeLabel
                                  ? `${row.currentTimeLabel} → ${row.timeLabel}`
                                  : row.timeLabel}
                              </span>
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
                      onClick={keepStaggeredSchedule}
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
          const onlineEvents = getOnlineEventsForDay(day);
          const hasRoomEvents = printRowsWithEvents.length > 0;
          const hasOnlineEvents = onlineEvents.length > 0;
          const hasAnyEvents = hasRoomEvents || hasOnlineEvents;

          const renderPrintEventRow = (
            event: (typeof onlineEvents)[0],
            eventKey: string,
            options?: { online?: boolean },
          ) => {
            const { section, start, end } = event;
            const color =
              departmentPaletteByKey.get(departmentColorKey(section)) ?? solidPaletteAt(0);
            const borderColor = options?.online ? "#7C3AED" : color.printBorder;
            const backgroundColor = options?.online ? "#F5F3FF" : color.printBg;

            if (isCrosslistGroupEvent(event) && event.crosslistGroupId && event.crosslistMembers) {
              return (
                <div
                  key={eventKey}
                  className="print-event-item flex gap-3 border-b border-slate-200 px-3 py-2.5 text-sm last:border-b-0"
                  style={{
                    borderLeftWidth: 4,
                    borderLeftStyle: "solid",
                    borderLeftColor: borderColor,
                    backgroundColor,
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
            const sectionBit = section.section_code ? ` · Section ${section.section_code}` : "";
            return (
              <div
                key={eventKey}
                className="print-event-item flex gap-3 border-b border-slate-200 px-3 py-2.5 text-sm last:border-b-0"
                style={{
                  borderLeftWidth: 4,
                  borderLeftStyle: "solid",
                  borderLeftColor: borderColor,
                  backgroundColor,
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
                Room sections are listed by building and room. Online sections (800–899) appear in a
                separate block below. Times are the scheduled start and end for {day}.
              </p>
              {!hasAnyEvents ? (
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
                  No sections scheduled for this day (with the current filters).
                </div>
              ) : (
                <>
                  {hasRoomEvents ? (
                    <div className="border border-slate-300 rounded-sm overflow-hidden">
                      {printRowsWithEvents.map(({ room, events }) => {
                        const sorted = [...events].sort(
                          (a, b) => a.start - b.start || a.lane - b.lane,
                        );
                        const roomTitle =
                          [room.building, formatRoomNumberForDisplay(room.room_number)]
                            .filter(Boolean)
                            .join(" ") || room.id;

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
                              {renderPrintEventRow(
                                sorted[0],
                                `print-event-${day}-${room.id}-${getCalendarEventKey(sorted[0], room.id)}-0`,
                              )}
                            </div>
                            {sorted.slice(1).map((event, idx) =>
                              renderPrintEventRow(
                                event,
                                `print-event-${day}-${room.id}-${getCalendarEventKey(event, room.id)}-${idx + 1}`,
                              ),
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {hasOnlineEvents ? (
                    <div
                      className={clsx(
                        "border border-violet-300 rounded-sm overflow-hidden",
                        hasRoomEvents && "mt-4",
                      )}
                    >
                      <div className="print-room-header bg-violet-100 px-3 py-2 text-sm font-bold text-violet-950">
                        Online sections
                        <span className="ml-2 font-normal text-violet-800">
                          · No physical room (section numbers 800–899)
                        </span>
                      </div>
                      {[...onlineEvents]
                        .sort((a, b) => a.start - b.start)
                        .map((event, idx) =>
                          renderPrintEventRow(
                            event,
                            `print-online-${day}-${getCalendarEventKey(event, "online")}-${idx}`,
                            { online: true },
                          ),
                        )}
                    </div>
                  ) : null}
                </>
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


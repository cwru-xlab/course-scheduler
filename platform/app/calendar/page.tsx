"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Filter,
  Lock,
  Maximize2,
  Minimize2,
  Palette,
  Printer,
  Redo2,
  Rocket,
  Save,
  Share2,
  Unlock,
  Undo2,
} from "lucide-react";
import type {
  LockedAssignment,
  ScheduleSolution,
  SchedulingInput,
} from "@/lib/scheduling/types";
import { MultiSelect } from "@/components/scheduler/MultiSelect";
import {
  LAST_SOLVER_ERROR_STORAGE_KEY,
  LAST_SOLVER_RUN_STORAGE_KEY,
  saveScheduleToHistory,
  type LastSolverRunSnapshot,
} from "@/lib/scheduling/history";
import { SCHEDULING_DATA_REFRESH_EVENT } from "@/lib/scheduling/useSchedulingData";
import {
  SCHEDULING_WINDOW_END_HOUR,
  SCHEDULING_WINDOW_START_HOUR,
} from "@/lib/scheduling/timeWindow";

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
  room_requirements?: string[];
  crosslist_group_id?: string | null;
  tags?: string[];
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
    meeting_pattern_id: fromMap?.meeting_pattern_id ?? "",
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

const TIMESLOT_DURATION_LEGEND: { label: string; sampleMin: number }[] = [
  { label: "≤ 60 min", sampleMin: 50 },
  { label: "61–90 min", sampleMin: 75 },
  { label: "91–120 min", sampleMin: 105 },
  { label: "121–150 min", sampleMin: 135 },
  { label: "> 150 min", sampleMin: 170 },
];

function selectSlotNearMinutes(
  timeslots: TimeslotDto[],
  selectedDay: Day,
  durationMinutes: number,
  dropMinutes: number,
): TimeslotWithMinutes | null {
  const daySlots = timeslots
    .filter((slot) => timeslotMatchesDay(slot, selectedDay))
    .map((slot) => ({
      ...slot,
      start: parseMinutes(slot.start_time),
      end: parseMinutes(slot.end_time),
    }))
    .filter((slot) => Math.abs(slot.end - slot.start - durationMinutes) <= 5);
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

  return createPortal(
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={!canUndo}
        onClick={onUndo}
        className={clsx(
          "flex items-center justify-center rounded-lg h-9 px-3 text-sm font-bold gap-2 border transition-colors shrink-0",
          canUndo
            ? "bg-slate-100 text-slate-900 border-slate-200 hover:bg-slate-200 dark:bg-default-100 dark:text-foreground dark:border-default-200 dark:hover:bg-default-200"
            : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed dark:bg-default-50 dark:text-default-400",
        )}
        title={canUndo ? "Undo last manual calendar change" : "Nothing to undo"}
        aria-label={canUndo ? "Undo last manual calendar change" : "Nothing to undo"}
      >
        <Undo2 className="size-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Undo</span>
      </button>
      <button
        type="button"
        disabled={!canRedo}
        onClick={onRedo}
        className={clsx(
          "flex items-center justify-center rounded-lg h-9 px-3 text-sm font-bold gap-2 border transition-colors shrink-0",
          canRedo
            ? "bg-slate-100 text-slate-900 border-slate-200 hover:bg-slate-200 dark:bg-default-100 dark:text-foreground dark:border-default-200 dark:hover:bg-default-200"
            : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed dark:bg-default-50 dark:text-default-400",
        )}
        title={canRedo ? "Redo last undone calendar change" : "Nothing to redo"}
        aria-label={canRedo ? "Redo last undone calendar change" : "Nothing to redo"}
      >
        <Redo2 className="size-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Redo</span>
      </button>
    </div>,
    slot,
  );
}

type CalendarDragFeedbackState = {
  status: "neutral" | "valid" | "invalid";
  message: string | null;
};

/** Fixed below the navbar so valid/invalid drag messages stay visible while the calendar scrolls. */
function CalendarDragFeedbackToastPortal({
  mountedOn,
  dragFeedback,
  dragError,
}: {
  mountedOn: HTMLElement | null;
  dragFeedback: CalendarDragFeedbackState;
  dragError: string | null;
}) {
  if (!mountedOn) return null;
  const line = dragFeedback.message ?? dragError;
  const isError = !!dragError || dragFeedback.status === "invalid";
  const isValid = !dragError && dragFeedback.status === "valid";
  const toastKey = `${dragFeedback.status}\u001f${dragError ?? ""}\u001f${dragFeedback.message ?? ""}`;

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
              "pointer-events-auto w-full max-w-3xl rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md",
              isError &&
                "border-red-200 bg-red-50/95 text-red-800 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200",
              isValid &&
                "border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100",
              !isError &&
                !isValid &&
                "border-slate-200 bg-white/95 text-slate-800 dark:border-default-200 dark:bg-default-100/95 dark:text-foreground",
            )}
          >
            {line}
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
  const [lockedSectionIds, setLockedSectionIds] = useState<string[]>([]);
  const [solverRunStatus, setSolverRunStatus] = useState<"idle" | "loading">("idle");
  const [solverRunError, setSolverRunError] = useState<string | null>(null);
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
  const [dragError, setDragError] = useState<string | null>(null);
  const [dragFeedback, setDragFeedback] = useState<{
    status: "neutral" | "valid" | "invalid";
    message: string | null;
  }>({ status: "neutral", message: null });
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
    message: string | null;
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
  const [sectionModal, setSectionModal] = useState<{
    mode: "create" | "edit";
    initialSectionId?: string;
    draft: SectionFormDraft;
  } | null>(null);
  const [sectionModalError, setSectionModalError] = useState<string | null>(null);
  const [isSavingSection, setIsSavingSection] = useState(false);
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (typeof window !== "undefined") {
          const raw = localStorage.getItem(LAST_SOLVER_RUN_STORAGE_KEY);
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as LastSolverRun;
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
                parsed.solution.assignments.map((assignment) => [
                  assignment.section_id,
                  assignment,
                ]),
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
                  room_requirements: section.room_requirements ?? [],
                  crosslist_group_id: section.crosslist_group_id ?? null,
                  tags: section.tags ?? [],
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

              const instructorsFromSolver = parsed.input.instructors.map(
                (instructor) => {
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
                },
              );
              const roomsFromSolver = parsed.input.rooms.map((room) => ({
                id: room.id,
                building: room.building,
                room_number: room.room_number,
                capacity: room.capacity,
              }));

              if (mounted) {
                setSolverInput(parsed.input);
                setAssignmentsBySection(nextAssignments);
                setBaselineAssignments(nextAssignments);
                setSolverTimeslotIdsBySection(allTimeslotIdsBySection);
                setLockedSectionIds(
                  Array.isArray(parsed.lockedSectionIds) ? parsed.lockedSectionIds : [],
                );
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
                meeting_pattern_id: "",
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
  }, []);

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

    // Greedy interval partitioning so overlapping classes are rendered in separate lanes.
    const laneEndTimes: number[] = [];
    return baseEvents.map((event) => {
      let lane = laneEndTimes.findIndex((laneEnd) => laneEnd <= event.start);
      if (lane === -1) {
        lane = laneEndTimes.length;
        laneEndTimes.push(event.end);
      } else {
        laneEndTimes[lane] = event.end;
      }
      return { ...event, lane };
    });
  }, [assignmentsBySection, data, selectedDay, solverTimeslotIdsBySection, timeslotById]);

  const dayEvents = useMemo(
    () => allDayEvents.filter((event) => sectionMatchesFilters(event.section)),
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

    const laneEndTimes: number[] = [];
    return baseEvents.map((event) => {
      let lane = laneEndTimes.findIndex((laneEnd) => laneEnd <= event.start);
      if (lane === -1) {
        lane = laneEndTimes.length;
        laneEndTimes.push(event.end);
      } else {
        laneEndTimes[lane] = event.end;
      }
      return { ...event, lane };
    });
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
      const visibleEvents = eventsWithLane.filter((event) => sectionMatchesFilters(event.section));
      const hiddenEvents = eventsWithLane.filter((event) => !sectionMatchesFilters(event.section));
      return { room, visibleEvents, hiddenEvents, rowHeight: Math.max(100, needed) };
    });
  }, [allEventsByRoom, data, sectionMatchesFilters]);

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

  const handleUndo = useCallback(() => {
    const stack = undoStackRef.current;
    const snapshot = stack[stack.length - 1];
    if (!snapshot) return;
    const currentSnapshot: UndoSnapshot = {
      key: stateKeyForUndo(assignmentsBySection, solverTimeslotIdsBySection),
      assignmentsBySection,
      solverTimeslotIdsBySection,
      backendSaveMessage,
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
  // Per-move validation feedback is transient; recomputing it on undo avoids stale/confusing messages.
  setDragFeedback({ status: "neutral", message: null });
  setDragError(null);
    setBackendSaveMessage(snapshot.backendSaveMessage);
  }, [assignmentsBySection, backendSaveMessage, solverTimeslotIdsBySection, stateKeyForUndo]);

  const handleRedo = useCallback(() => {
    const stack = redoStackRef.current;
    const snapshot = stack[stack.length - 1];
    if (!snapshot) return;
    const currentSnapshot: UndoSnapshot = {
      key: stateKeyForUndo(assignmentsBySection, solverTimeslotIdsBySection),
      assignmentsBySection,
      solverTimeslotIdsBySection,
      backendSaveMessage,
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
    setDragFeedback({ status: "neutral", message: null });
    setDragError(null);
    setBackendSaveMessage(snapshot.backendSaveMessage);
  }, [assignmentsBySection, backendSaveMessage, solverTimeslotIdsBySection, stateKeyForUndo]);

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
    return changed && dragFeedback.status === "valid";
  }, [assignmentsBySection, baselineAssignments, dragFeedback.status]);

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
      setLockedSectionIds((prev) => {
        const next = new Set(prev);
        const anyLocked = peers.some((p) => next.has(p));
        if (anyLocked) peers.forEach((p) => next.delete(p));
        else peers.forEach((p) => next.add(p));
        return Array.from(next);
      });
      setCalendarContextMenu(null);
    },
    [canLockSectionPlacement, data],
  );

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
    setDragFeedback({
      status: groupsLocked > 0 ? "valid" : "neutral",
      message:
        groupsLocked > 0
          ? `Locked ${groupsLocked} section group(s) that differ from the baseline. Cross-listed peers lock together.`
          : "No changed sections with both a room and times to lock.",
    });
  }, [assignmentsBySection, baselineAssignments, data, lockedSectionIds]);

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

  const handleRunSolverFromCalendar = useCallback(async () => {
    setSolverRunError(null);
    setSolverRunStatus("loading");
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
      };
      if (!response.ok || result.status === "error") {
        if (typeof window !== "undefined") {
          localStorage.setItem(
            LAST_SOLVER_ERROR_STORAGE_KEY,
            JSON.stringify({
              input: nextInput,
              errors: result.errors ?? [],
              diagnostics: result.diagnostics,
              createdAt: new Date().toISOString(),
            }),
          );
        }
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
      if (data) {
        setData({
          ...data,
          sections: data.sections.map((section) => {
            const assignment = nextAssignments[section.id];
            return {
              ...section,
              room_id: assignment?.room_id ?? section.room_id ?? null,
              timeslot_id: assignment?.timeslot_ids?.[0] ?? section.timeslot_id ?? null,
            };
          }),
        });
      }
      setDragFeedback({
        status: "valid",
        message: "Solver finished. Schedule updated on this page.",
      });
    } catch (e) {
      setSolverRunError(e instanceof Error ? e.message : "Failed to run solver.");
    } finally {
      setSolverRunStatus("idle");
    }
  }, [
    assignmentsBySection,
    data,
    lockedSectionIds,
    router,
    solverInput,
    updateLastRunStorage,
  ]);

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

  /** When dragging starts, show ALL timeslots for the selected day. */
  const dragPossibleTimeslots = useMemo(() => {
    if (!data || !calendarDrag?.sectionId) return [];
    return data.timeslots
      .filter((slot) => timeslotMatchesDay(slot, selectedDay))
      .map((slot) => ({
        ...slot,
        start: parseMinutes(slot.start_time),
        end: parseMinutes(slot.end_time),
      }));
  }, [calendarDrag?.sectionId, data, selectedDay]);

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

  const commitCalendarPlacement = useCallback(
    (sectionId: string, targetRoomId: string, selectedSlot: TimeslotWithMinutes) => {
      if (!data) return;
      const dragged = allDayEvents.find((x) => x.section.id === sectionId && x.timeslot);
      if (!dragged || !dragged.timeslot) return;

      const currentAssignment = assignmentsBySection[sectionId];
      const currentRoomId = currentAssignment?.room_id ?? dragged.section.room_id ?? "";
      const targetRoom = data.rooms.find((room) => room.id === targetRoomId);
      const requiredSeats =
        dragged.section.enrollment_cap ?? dragged.section.expected_enrollment ?? 0;
      if (
        targetRoomId !== currentRoomId &&
        Number.isFinite(targetRoom?.capacity) &&
        requiredSeats > (targetRoom?.capacity ?? 0)
      ) {
        setDragFeedback({
          status: "invalid",
          message: `Invalid: ${dragged.section.department ?? ""} ${dragged.section.course_id} requires ${requiredSeats} seats, but room ${targetRoomId} capacity is ${targetRoom?.capacity}.`,
        });
        return;
      }

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
      const alreadyPlaced =
        targetRoomId === (currentRoomId ?? "") &&
        JSON.stringify([...uniqueNextTimeslotIds].sort()) ===
          JSON.stringify([...(currentAssignment?.timeslot_ids ?? currentTimeslotIds)].sort());
      if (!alreadyPlaced) {
        setRedoStack([]);
        redoStackRef.current = [];
        setUndoStack((prev) => {
          const key = stateKeyForUndo(assignmentsBySection, solverTimeslotIdsBySection);
          const lastKey = prev.length ? prev[prev.length - 1]?.key : null;
          if (lastKey === key) return prev;
          const next = [
            ...prev,
            {
              key,
              assignmentsBySection,
              solverTimeslotIdsBySection,
              backendSaveMessage,
            },
          ];
          const trimmed = next.length > 25 ? next.slice(next.length - 25) : next;
          undoStackRef.current = trimmed;
          return trimmed;
        });
      }
      const nextAssignments: AssignmentMap = {
        ...assignmentsBySection,
        [sectionId]: {
          timeslot_ids: uniqueNextTimeslotIds,
          room_id: targetRoomId,
          meeting_pattern_id: currentAssignment?.meeting_pattern_id ?? "",
        },
      };
      setAssignmentsBySection(nextAssignments);
      setSolverTimeslotIdsBySection((prev) => ({
        ...prev,
        [sectionId]: uniqueNextTimeslotIds,
      }));

      const selectedStart = selectedSlot.start;
      const selectedEnd = selectedSlot.end;
      const conflicts = allDayEvents.filter((eventItem) => {
        if (eventItem.section.id === sectionId) return false;
        const itemRoomId =
          nextAssignments[eventItem.section.id]?.room_id ?? eventItem.section.room_id ?? "";
        if (itemRoomId !== targetRoomId) return false;
        return selectedStart < eventItem.end && selectedEnd > eventItem.start;
      });

      if (conflicts.length > 0) {
        const conflictNames = conflicts
          .map((c) => `${c.section.department ?? ""} ${c.section.course_id}`.trim())
          .filter(Boolean)
          .slice(0, 3)
          .join(", ");
        setDragFeedback({
          status: "invalid",
          message: `Invalid: ${dragged.section.department ?? ""} ${dragged.section.course_id} conflicts with ${conflictNames || "another class"} in room ${targetRoomId} at ${formatTimeAmPm(selectedSlot.start_time)}-${formatTimeAmPm(selectedSlot.end_time)}.`,
        });
      } else {
        setDragFeedback({
          status: "valid",
          message: `Valid: moved to room ${targetRoomId}, ${selectedDay} ${formatTimeAmPm(selectedSlot.start_time)}-${formatTimeAmPm(selectedSlot.end_time)}. This change can be persisted.`,
        });
        setDragError(null);
      }
    },
    [
      assignmentsBySection,
      allDayEvents,
      backendSaveMessage,
      data,
      dragError,
      dragFeedback,
      selectedDay,
      solverTimeslotIdsBySection,
      timeslotById,
    ],
  );

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
    (sectionId: string, targetRoomId: string, slot: TimeslotWithMinutes) => {
      if (!data) return { isValid: false, message: "Calendar data is unavailable." };
      const section = data.sections.find((s) => s.id === sectionId);
      if (!section) return { isValid: false, message: "Section not found." };
      const targetRoom = data.rooms.find((room) => room.id === targetRoomId);
      const requiredSeats = section.enrollment_cap ?? section.expected_enrollment ?? 0;
      if (
        Number.isFinite(targetRoom?.capacity) &&
        requiredSeats > (targetRoom?.capacity ?? 0)
      ) {
        return {
          isValid: false,
          message: `Invalid: ${section.department ?? ""} ${section.course_id} requires ${requiredSeats} seats, but room ${targetRoomId} capacity is ${targetRoom?.capacity}.`,
        };
      }
      const conflicts = allDayEvents.filter((eventItem) => {
        if (eventItem.section.id === sectionId) return false;
        const itemRoomId =
          assignmentsBySection[eventItem.section.id]?.room_id ?? eventItem.section.room_id ?? "";
        if (itemRoomId !== targetRoomId) return false;
        return slot.start < eventItem.end && slot.end > eventItem.start;
      });
      if (conflicts.length > 0) {
        const conflictNames = conflicts
          .map((c) => `${c.section.department ?? ""} ${c.section.course_id}`.trim())
          .filter(Boolean)
          .slice(0, 3)
          .join(", ");
        return {
          isValid: false,
          message: `Invalid: conflicts with ${conflictNames || "another class"} in room ${targetRoomId} at ${formatTimeAmPm(slot.start_time)}-${formatTimeAmPm(slot.end_time)}.`,
        };
      }
      return {
        isValid: true,
        message: `Valid placement: room ${targetRoomId}, ${selectedDay} ${formatTimeAmPm(slot.start_time)}-${formatTimeAmPm(slot.end_time)}.`,
      };
    },
    [allDayEvents, assignmentsBySection, data, selectedDay],
  );

  const commitPlacementByClick = useCallback(
    (sectionId: string, targetRoomId: string, slot: TimeslotWithMinutes) => {
      const check = evaluatePlacement(sectionId, targetRoomId, slot);
      if (!check.isValid) {
        setDragFeedback({ status: "invalid", message: check.message });
        return;
      }
      const currentAssignment = assignmentsBySection[sectionId];
      const nextAssignments: AssignmentMap = {
        ...assignmentsBySection,
        [sectionId]: {
          timeslot_ids: [slot.id],
          room_id: targetRoomId,
          meeting_pattern_id: currentAssignment?.meeting_pattern_id ?? "",
        },
      };
      setAssignmentsBySection(nextAssignments);
      setSolverTimeslotIdsBySection((prev) => ({ ...prev, [sectionId]: [slot.id] }));
      setPendingPlacementSectionId(null);
      setPlacementPreview(null);
      setDragFeedback({ status: "valid", message: check.message });
      setBackendSaveMessage({
        type: "success",
        text: "Section placed on the calendar. Click Update Backend to persist this placement.",
      });
    },
    [assignmentsBySection, evaluatePlacement],
  );

  const handleUpdateBackend = async () => {
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
          sections: mergedSections.map((section) => ({
            id: section.id,
            course_id: String(section.course_id),
            department: (section.department ?? "").trim(),
            section_code: section.section_code,
            instructor_id: section.instructor_id,
            expected_enrollment: section.expected_enrollment ?? 0,
            enrollment_cap: section.enrollment_cap ?? section.expected_enrollment ?? 0,
            allowed_meeting_patterns: section.allowed_meeting_patterns ?? [],
            room_requirements: section.room_requirements ?? [],
            crosslist_group_id: section.crosslist_group_id ?? null,
            tags: section.tags ?? [],
          })),
        };
        setSolverInput(nextInput);
        updateLastRunStorage(nextInput, assignmentsBySection);
      }
      setBackendSaveMessage({
        type: "success",
        text: "Backend updated. Sections will appear in the Sections editor and be used by Run Solver.",
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(SCHEDULING_DATA_REFRESH_EVENT));
      }
    } catch (err) {
      setBackendSaveMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update backend.",
      });
    } finally {
      setIsSavingBackend(false);
    }
  };

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
          sections: nextSections.map((section) => ({
            id: section.id,
            course_id: String(section.course_id),
            department: (section.department ?? "").trim(),
            section_code: section.section_code,
            instructor_id: section.instructor_id,
            expected_enrollment: section.expected_enrollment ?? 0,
            enrollment_cap: section.enrollment_cap ?? section.expected_enrollment ?? 0,
            allowed_meeting_patterns: section.allowed_meeting_patterns ?? [],
            room_requirements: section.room_requirements ?? [],
            crosslist_group_id: section.crosslist_group_id ?? null,
            tags: section.tags ?? [],
          })),
        };
        setSolverInput(nextInput);
        updateLastRunStorage(nextInput, nextAssignments);
      }

      setBackendSaveMessage({
        type: "success",
        text:
          sectionModal.mode === "create"
            ? "Section created. Click an available room/timeslot space to place it."
            : "Section updates saved to backend.",
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(SCHEDULING_DATA_REFRESH_EVENT));
      }
      if (sectionModal.mode === "create") {
        setPendingPlacementSectionId(normalizedSection.id);
        setDragFeedback({
          status: "neutral",
          message:
            "New section created. Hover over available room/timeslot space, then click to place it.",
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
    sectionModal,
    solverInput,
    solverTimeslotIdsBySection,
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
        snapshot,
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          LAST_SOLVER_RUN_STORAGE_KEY,
          JSON.stringify(snapshot),
        );
      }
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
  }, [buildSnapshotFromCurrentView, saveScheduleModal.draft.name, saveScheduleModal.draft.scheduleDate]);

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
        dragError={dragError}
      />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Schedule Output Calendar
          </h1>
          <p className="text-slate-500 text-base">
            Click through Monday–Friday to view scheduled sections.
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            onClick={openSaveScheduleModal}
            className="flex items-center justify-center rounded-lg h-10 px-4 bg-indigo-50 text-indigo-800 font-bold gap-2 border border-indigo-200 hover:bg-indigo-100 transition-colors"
            title="Save this generated/edited schedule to history"
          >
            <Save className="size-4" />
            Save Schedule
          </button>
          <Link
            href="/history"
            className="flex items-center justify-center rounded-lg h-10 px-4 bg-slate-100 text-slate-800 font-bold gap-2 border border-slate-200 hover:bg-slate-200 transition-colors"
          >
            <Archive className="size-4" />
            History
          </Link>
          <button
            className="flex items-center justify-center rounded-lg h-10 px-4 bg-slate-100 text-slate-900 font-bold gap-2 border border-slate-200"
            onClick={handleExportPdf}
          >
            <Share2 className="size-4" />
            Export PDF
          </button>
          <button
            type="button"
            onClick={lockAllPlacementChanges}
            className="flex items-center justify-center rounded-lg h-10 px-4 bg-amber-50 text-amber-900 font-bold gap-2 border border-amber-200 hover:bg-amber-100 transition-colors"
            title="Hard-lock every section whose placement differs from the saved baseline (needs room + times)"
          >
            <Lock className="size-4" />
            Lock all changes
          </button>
          <button
            type="button"
            disabled={!hasAnyPlacementLock}
            onClick={unlockAllPlacementLocks}
            className={clsx(
              "flex items-center justify-center rounded-lg h-10 px-4 font-bold gap-2 border transition-colors",
              hasAnyPlacementLock
                ? "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100"
                : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed",
            )}
            title="Remove all placement locks added from this calendar view"
          >
            <Unlock className="size-4" />
            Unlock all
          </button>
          <button
            type="button"
            disabled={solverRunStatus === "loading" || !data}
            onClick={() => void handleRunSolverFromCalendar()}
            className={clsx(
              "flex items-center justify-center rounded-lg h-10 px-4 font-bold gap-2 border transition-colors",
              solverRunStatus !== "loading" && data
                ? "bg-[#137fec] text-white border-[#137fec] shadow-lg shadow-[#137fec]/20 hover:bg-[#0f6dca]"
                : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed",
            )}
            title="Run the solver using backend scheduling data and locks from this page"
          >
            <Rocket className="size-4" />
            {solverRunStatus === "loading" ? "Running…" : "Run Solver"}
          </button>
          <button
            type="button"
            disabled={!hasValidUnsavedEdit || isSavingBackend}
            onClick={handleUpdateBackend}
            className={clsx(
              "flex items-center justify-center rounded-lg h-10 px-4 font-bold gap-2 border transition-colors",
              hasValidUnsavedEdit && !isSavingBackend
                ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed",
            )}
            title={
              hasValidUnsavedEdit
                ? "Persist valid calendar edits to backend"
                : "Make a valid edit first to enable backend update"
            }
          >
            Update Backend
          </button>
          <Link
            href="/editor/sections"
            className="flex items-center justify-center rounded-lg h-10 px-4 bg-[#137fec] text-white font-bold gap-2 shadow-lg shadow-[#137fec]/20"
          >
            <Rocket className="size-4" />
            Adjust Schedule Data
          </Link>
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
              label="Filter by departments"
              placeholder="Departments"
              options={departmentFilterOptions}
              value={selectedDepartmentKeys}
              onChange={setSelectedDepartmentKeys}
              showSearch
            />
            <MultiSelect
              label="Filter by professors"
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

      {calendarDrag?.sectionId && dragPossibleTimeslots.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-widest w-full sm:w-auto">
              Timeslot length (while dragging)
            </span>
            {TIMESLOT_DURATION_LEGEND.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span
                  className="h-3.5 w-6 shrink-0 rounded border border-slate-200/80"
                  style={{ backgroundColor: rgbaFillForTimeslotDuration(item.sampleMin, "strong") }}
                  aria-hidden
                />
                <span className="text-xs font-semibold text-slate-700">{item.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
            Shaded columns appear only while you drag; colors match slot duration on{" "}
            <span className="font-semibold">{selectedDay}</span>.
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
          className="flex items-center justify-center rounded-lg h-10 px-4 bg-indigo-50 text-indigo-800 font-bold border border-indigo-200 hover:bg-indigo-100 transition-colors shrink-0"
        >
          + Add Section
        </button>
      </div>

      {/* Main calendar grid */}
      <div
        className={clsx(
          "rounded-xl border shadow-lg overflow-hidden flex flex-col min-h-[600px]",
          dragFeedback.status === "invalid" || dragError
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
                  className="relative border-b border-slate-200/80 last:border-b-0"
                  style={{ minHeight: rowHeight }}
                  onPointerMove={(e) => {
                    if (!pendingPlacementSectionId || calendarDrag) return;
                    const mins = minutesFromPointerInRoom(e.clientX, room.id);
                    if (mins === null || !data) return;
                    const slot = selectAnySlotNearMinutes(data.timeslots, selectedDay, mins);
                    if (!slot) return;
                    const check = evaluatePlacement(pendingPlacementSectionId, room.id, slot);
                    setPlacementPreview({
                      targetRoomId: room.id,
                      slotId: slot.id,
                      startMin: slot.start,
                      endMin: slot.end,
                      isValid: check.isValid,
                      message: check.message,
                    });
                    setDragFeedback({
                      status: check.isValid ? "valid" : "invalid",
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
                  onClick={() => {
                    if (!pendingPlacementSectionId || !placementPreview || calendarDrag) return;
                    if (placementPreview.targetRoomId !== room.id) return;
                    const slot = timeslotById.get(placementPreview.slotId);
                    if (!slot) return;
                    commitPlacementByClick(pendingPlacementSectionId, room.id, {
                      ...slot,
                      start: placementPreview.startMin,
                      end: placementPreview.endMin,
                    });
                  }}
                >
                  {calendarDrag?.sectionId &&
                    dragPossibleTimeslots
                      .filter((slot) => slot.end > axisStart && slot.start < axisEnd)
                      .map((slot) => {
                        const durationMin = Math.max(0, slot.end - slot.start);
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
                              backgroundColor: rgbaFillForTimeslotDuration(durationMin, "strong"),
                              zIndex: 0,
                            }}
                            title={`${formatTimeAmPm(slot.start_time)}–${formatTimeAmPm(slot.end_time)} (${durationMin} min)`}
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
                  {calendarDrag?.sectionId &&
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
                      const durationMin = timeslotDurationMinutes(slot);
                      const bg = rgbaFillForTimeslotDuration(durationMin, "strong");
                      const border = rgbaBorderForTimeslotDuration(durationMin);
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
                      const bg = placementPreview.isValid
                        ? "rgba(16, 185, 129, 0.16)"
                        : "rgba(239, 68, 68, 0.16)";
                      const border = placementPreview.isValid
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
                            {placementPreview.isValid ? "Click to place" : "Cannot place here"}
                          </div>
                        </div>
                      );
                    })()}

                  {visibleEvents.map(({ section, timeslot, start, end, lane }) => {
                const leftPct =
                  (clamp(start, axisStart, axisEnd) - axisStart) / axisRange;
                const widthPct =
                  (clamp(end, axisStart, axisEnd) -
                    clamp(start, axisStart, axisEnd)) /
                  axisRange;
                    const top = EVENT_TOP_PADDING_PX + lane * (EVENT_HEIGHT_PX + EVENT_GAP_PX);

                const inst = instructorById.get(section.instructor_id);
                const professor = inst?.name ?? section.instructor_id ?? "—";
                const title = section.department + " " + section.course_id;
                    const timeLabel = `${formatTimeAmPm(timeslot?.start_time ?? "00:00")} - ${formatTimeAmPm(timeslot?.end_time ?? "00:00")}`;
                    const color =
                      departmentPaletteByKey.get(departmentColorKey(section)) ?? solidPaletteAt(0);
                    const matchesHoveredDepartment =
                      activeLegendDepartmentKeys.size === 0 ||
                      activeLegendDepartmentKeys.has(departmentColorKey(section));

                const isDragSource = calendarDrag?.sectionId === section.id;
                const placementLocked = isPlacementLocked(section.id);
                return (
                  <div
                    key={`${room.id}-${section.id}`}
                    className={clsx(
                      "absolute border-l-4 rounded-lg p-2.5 flex flex-col justify-between z-10 shadow-sm select-none",
                      solverInput && "cursor-grab touch-none active:cursor-grabbing",
                      !isDragSource && "hover:shadow-md",
                      isDragSource &&
                        calendarDrag?.hasMoved &&
                        "opacity-[0.12] pointer-events-none",
                      !matchesHoveredDepartment && "opacity-35",
                      activeLegendDepartmentKeys.size > 0 &&
                        matchesHoveredDepartment &&
                        "ring-2 ring-slate-300/80 shadow-md",
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
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCalendarContextMenu({
                        clientX: e.clientX,
                        clientY: e.clientY,
                        sectionId: section.id,
                      });
                    }}
                    onPointerDown={(e) => {
                      if (!solverInput || e.button !== 0) return;
                      e.stopPropagation();
                      e.preventDefault();
                      calendarDragPointerYRef.current = e.clientY;
                      const targetEl = e.currentTarget;
                      targetEl.setPointerCapture(e.pointerId);
                      setDragError(null);
                      setBackendSaveMessage(null);
                      setCalendarDrag({
                        sectionId: section.id,
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
                    }}
                    onPointerMove={(e) => {
                      setCalendarDrag((prev) => {
                        if (!prev || e.pointerId !== prev.pointerId) return prev;
                        const dist = Math.hypot(e.clientX - prev.startX, e.clientY - prev.startY);
                        const hasMoved = prev.hasMoved || dist > 8;
                        if (!data) return { ...prev, hasMoved };
                        const draggedE = allDayEvents.find(
                          (x) => x.section.id === prev.sectionId && x.timeslot,
                        );
                        if (!draggedE) return { ...prev, hasMoved };
                        const duration = draggedE.end - draggedE.start;
                        let roomId =
                          findRoomIdAtClientY(e.clientY) ??
                          draggedE.section.room_id ??
                          "";
                        if (!roomId) return { ...prev, hasMoved };
                        const mins = minutesFromPointerInRoom(e.clientX, roomId);
                        if (mins === null) return { ...prev, hasMoved };
                        const slot = selectSlotNearMinutes(
                          data.timeslots,
                          selectedDay,
                          duration,
                          mins,
                        );
                        if (!slot) return { ...prev, hasMoved };
                        return {
                          ...prev,
                          hasMoved,
                          preview: {
                            targetRoomId: roomId,
                            slotId: slot.id,
                            startMin: slot.start,
                            endMin: slot.end,
                          },
                        };
                      });
                    }}
                    onPointerUp={(e) => {
                      setCalendarDrag((prev) => {
                        if (!prev || e.pointerId !== prev.pointerId) return prev;
                        try {
                          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                        } catch {
                          /* noop */
                        }
                        const moved =
                          prev.hasMoved ||
                          Math.hypot(e.clientX - prev.startX, e.clientY - prev.startY) > 8;
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
                    {placementLocked && (
                      <Lock
                        className="pointer-events-none absolute right-1 top-1 size-3.5 text-slate-800 drop-shadow-sm opacity-90"
                        aria-label="Placement locked for solver"
                      />
                    )}
                      <div className="font-black text-[10px] truncate text-slate-900 pr-4">
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
                  const ttlPv = `${section.department} ${section.course_id}`;
                  const timeLabelPv = `${formatTimeAmPm(st.start_time)} - ${formatTimeAmPm(st.end_time)}`;
                  const colorPv =
                    departmentPaletteByKey.get(departmentColorKey(section)) ?? solidPaletteAt(0);
                  const previewMatchesHoveredDepartment =
                    activeLegendDepartmentKeys.size === 0 ||
                    activeLegendDepartmentKeys.has(departmentColorKey(section));
                  return (
                    <div
                      key="calendar-drag-preview"
                      className={clsx(
                        "absolute pointer-events-none z-[25] border-l-4 rounded-lg p-2.5 flex flex-col justify-between shadow-sm ring-2 ring-[#137fec]/40 ring-inset",
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

      {/* Bottom cards - similar vibe to reference */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="size-5 text-[#137fec]" />
            <h3 className="font-bold text-sm text-slate-900">
              Day Summary
            </h3>
          </div>
          <div className="text-sm text-slate-600">
            Showing <span className="font-bold">{dayEvents.length}</span>{" "}
            scheduled section(s) across <span className="font-bold">{roomRows.length}</span>{" "}
            room(s) for <span className="font-bold">{selectedDay}</span>. Use the{" "}
            <span className="font-bold">department colors</span> legend above to match swatches to departments.
          </div>
        </div>

        <div className="bg-rose-50 p-6 rounded-xl border border-rose-100 shadow-sm col-span-1 md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="size-5 text-rose-500" />
            <h3 className="font-bold text-sm text-rose-900">
              Conflict Detection (prototype)
            </h3>
          </div>
          <div className="text-[11px] leading-relaxed text-slate-700">
            This view is a visual schedule representation. Conflict detection can
            be computed from constraints and solver output in a later step.
          </div>
        </div>
      </div>

      {/* Table view: placements + lock for solver */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Schedule table</h3>
            <p className="text-[11px] text-slate-500">
              Lock keeps a section on its current room and times when you run the solver. Cross-listed
              sections lock as a group.
            </p>
          </div>
          {hasAnyPlacementLock && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800">
              {lockedSectionIds.length} locked id(s)
            </span>
          )}
        </div>
        <div className="overflow-x-auto max-h-[min(480px,55vh)] overflow-y-auto">
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
              {tableSectionsFiltered.map((section) => {
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
      </div>

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

      {saveScheduleModal.isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => {
            if (saveScheduleModal.isSaving) return;
            closeSaveScheduleModal();
          }}
        >
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
        </div>
      )}

      {sectionModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => {
            if (isSavingSection) return;
            setSectionModal(null);
            setSectionModalError(null);
          }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-black text-slate-900">
                {sectionModal.mode === "create" ? "Add Section" : "Edit Section"}
              </h3>
              <button
                type="button"
                disabled={isSavingSection}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  setSectionModal(null);
                  setSectionModalError(null);
                }}
              >
                Close
              </button>
            </div>
            <div className="space-y-4 px-6 py-5 text-sm">
              {sectionModal.mode === "create" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Rooms and timeslots are assigned directly on the calendar. After creating this
                  section, hover over an available room/time space and click to place it.
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
                    className="rounded-lg border border-slate-200 px-3 py-2 bg-white"
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
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-xs font-semibold text-slate-600">Allowed Meeting Patterns (comma-separated)</span>
                  <input
                    className="rounded-lg border border-slate-200 px-3 py-2"
                    value={sectionModal.draft.allowed_meeting_patterns}
                    onChange={(e) => updateSectionModalDraft("allowed_meeting_patterns", e.target.value)}
                    disabled={isSavingSection}
                  />
                </label>
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
              <div className="flex justify-end gap-2">
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
          </div>
        </div>
      )}

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
                            `print-event-${day}-${room.id}-${sorted[0].section.id}-0`,
                          )}
                        </div>
                        {sorted.slice(1).map((event, idx) =>
                          renderEventRow(
                            event,
                            `print-event-${day}-${room.id}-${event.section.id}-${idx + 1}`,
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


import ExcelJS from "exceljs";

import {
  displayAssignedHalfForSection,
  resolveDisplayHalvesForRoomPlacements,
  resolvedDurationLabel,
  termBadgeLabel,
  termStackRank,
  type RoomSlotPlacement,
} from "@/lib/scheduling/semesterLength";
import { isOnlineSection } from "@/lib/scheduling/sectionOnline";
import { isSectionArchived } from "@/lib/scheduling/sectionState";
import { canonicalizeRoomNumber } from "@/lib/scheduling/roomNumber";
import {
  SCHEDULING_WINDOW_END_HOUR,
  SCHEDULING_WINDOW_START_HOUR,
} from "@/lib/scheduling/timeWindow";

export const ROOM_ASSIGNMENT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
export type RoomAssignmentDay = (typeof ROOM_ASSIGNMENT_DAYS)[number];

/** SOC compact day tokens used in WSOM "Days and Times" strings (TuTh, MW, …). */
const DAY_TO_SOC: Record<RoomAssignmentDay, string> = {
  Mon: "M",
  Tue: "Tu",
  Wed: "W",
  Thu: "Th",
  Fri: "F",
};

const DAY_LETTER: Record<RoomAssignmentDay, string> = {
  Mon: "M",
  Tue: "T",
  Wed: "W",
  Thu: "R",
  Fri: "F",
};

const ASSIGNMENT_HEADERS = [
  "Instructor",
  "Subject",
  "Number",
  "Class Title",
  "Section",
  "Duration",
  "Days and Times",
  "Room Number",
] as const;

/** Matches the calendar's distinct solid department palette. */
const DEPARTMENT_PALETTE: Array<{ bg: string; border: string }> = [
  { bg: "DBEAFE", border: "1D4ED8" },
  { bg: "DCFCE7", border: "16A34A" },
  { bg: "FEF3C7", border: "D97706" },
  { bg: "FFE4E6", border: "E11D48" },
  { bg: "E0E7FF", border: "4338CA" },
  { bg: "CFFAFE", border: "0891B2" },
  { bg: "EDE9FE", border: "7C3AED" },
  { bg: "FFEDD5", border: "EA580C" },
  { bg: "ECFCCB", border: "4D7C0F" },
  { bg: "FAE8FF", border: "A21CAF" },
  { bg: "FCE7F3", border: "BE185D" },
  { bg: "FEF9C3", border: "A16207" },
];

const GRID_HEADER_FILL = "1E293B";
const GRID_HEADER_FONT = "FFFFFF";
const GRID_ROOM_FILL = "F1F5F9";
const GRID_EMPTY_FILL = "FAFAFA";
const GRID_BORDER = "CBD5E1";
const ONLINE_BAND_FILL = "EDE9FE";
const ONLINE_BAND_FONT = "5B21B6";
const ONLINE_GRID_EMPTY_FILL = "F5F3FF";
const ONLINE_LANE_ROOM_ID_PREFIX = "__ONLINE__::";

export type RoomAssignmentSection = {
  id: string;
  course_id: string | number;
  department?: string | null;
  section_code: string;
  instructor_id: string;
  crosslist_group_id?: string | null;
  room_id?: string | null;
  timeslot_id?: string | null;
  state?: string | null;
  /** Stored section number from scheduling data (e.g. 100, 400). */
  section_number?: string | null;
  semester_length?: string | null;
};

export type RoomAssignmentInstructor = {
  id: string;
  name?: string;
};

export type RoomAssignmentRoom = {
  id: string;
  building?: string;
  room_number?: string;
};

export type RoomAssignmentTimeslot = {
  id: string;
  days?: string;
  day?: string;
  start_time: string;
  end_time: string;
};

export type RoomAssignmentPlacement = {
  timeslot_ids?: string[];
  room_id?: string | null;
  meeting_pattern_id?: string;
  assigned_half?: string | null;
};

export type RoomAssignmentWorkbookInput = {
  sections: RoomAssignmentSection[];
  instructors: RoomAssignmentInstructor[];
  rooms: RoomAssignmentRoom[];
  timeslots: RoomAssignmentTimeslot[];
  assignments: Record<string, RoomAssignmentPlacement>;
};

/**
 * Subject = department / SUBJ code (e.g. ACCT).
 * Number = catalog number currently stored in section_code (e.g. 306).
 * Class Title = course_id (title text in current imports).
 * Section = stored section_number when set; otherwise blank.
 */
export function resolveAssignmentColumns(section: RoomAssignmentSection): {
  subject: string;
  number: string;
  classTitle: string;
  section: string;
} {
  const subject = String(section.department ?? "")
    .trim()
    .toUpperCase();
  const number = String(section.section_code ?? "").trim();
  const classTitle = String(section.course_id ?? "").trim();
  const storedSection = String(section.section_number ?? "").trim();
  return {
    subject,
    number,
    classTitle,
    section: storedSection,
  };
}

/** @deprecated Prefer resolveAssignmentColumns — kept for any callers that split course_id. */
export function parseCourseId(
  courseId: string | number,
  department?: string | null,
): { subject: string; number: string } {
  const raw = String(courseId ?? "").trim();
  const dept = String(department ?? "").trim();
  const match = raw.match(/^([A-Za-z]+)(.*)$/);
  if (match) {
    const subject = match[1].toUpperCase();
    const number = match[2].replace(/^[\s\-_.]+/, "").trim();
    if (number) return { subject, number };
    return { subject: dept || subject, number: "" };
  }
  return { subject: dept, number: raw };
}

export function formatRoomNumberForDisplay(roomNumber?: string): string {
  return canonicalizeRoomNumber(roomNumber);
}

export function formatRoomLabel(room: RoomAssignmentRoom | null | undefined): string {
  if (!room) return "";
  const label = [room.building, formatRoomNumberForDisplay(room.room_number)]
    .filter(Boolean)
    .join(" ")
    .trim();
  return label || room.id || "";
}

function parseMinutes(hhmm: string): number {
  const raw = (hhmm ?? "").trim();
  if (!raw) return 0;

  const amPmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])$/);
  if (amPmMatch) {
    const hour = parseInt(amPmMatch[1], 10);
    const mins = parseInt(amPmMatch[2], 10);
    const suffix = amPmMatch[3].toUpperCase();
    const normalizedHour =
      suffix === "PM" ? (hour === 12 ? 12 : hour + 12) : hour === 12 ? 0 : hour;
    return normalizedHour * 60 + (Number.isFinite(mins) ? mins : 0);
  }

  const [h, m] = raw.split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** WSOM-style clock: `1:00PM` (no space before AM/PM). */
export function formatTimeAmPmCompact(hhmm: string): string {
  const minutes = parseMinutes(hhmm);
  const h24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${mins.toString().padStart(2, "0")}${suffix}`;
}

export function timeslotMatchesDay(
  timeslot: RoomAssignmentTimeslot,
  selected: RoomAssignmentDay,
): boolean {
  const raw = (timeslot.days ?? timeslot.day ?? "").toString().trim();
  if (!raw) return false;

  const aliasesByDay: Record<RoomAssignmentDay, string[]> = {
    Mon: ["mon", "monday", "m"],
    Tue: ["tue", "tues", "tuesday", "tu", "t"],
    Wed: ["wed", "weds", "wednesday", "w"],
    Thu: ["thu", "thur", "thurs", "thursday", "th", "r"],
    Fri: ["fri", "friday", "f"],
  };
  const selectedAliases = new Set(aliasesByDay[selected]);

  const tokens = raw
    .toLowerCase()
    .split(/[^a-z]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (selectedAliases.has(token)) return true;
  }

  const compact = raw.toUpperCase().replace(/[^A-Z]/g, "");
  if (/^[MTWRFSU]+$/.test(compact)) {
    return compact.includes(DAY_LETTER[selected]);
  }

  return false;
}

function daysPresentInSlots(slots: RoomAssignmentTimeslot[]): RoomAssignmentDay[] {
  return ROOM_ASSIGNMENT_DAYS.filter((day) =>
    slots.some((slot) => timeslotMatchesDay(slot, day)),
  );
}

function compactSocDays(days: RoomAssignmentDay[]): string {
  return days.map((day) => DAY_TO_SOC[day]).join("");
}

/**
 * Build a WSOM-style Days and Times string from assigned timeslots.
 * Example: `TuTh 1:00PM - 2:15PM`. Multiple distinct ranges joined with `; `.
 */
export function formatDaysAndTimes(timeslots: RoomAssignmentTimeslot[]): string {
  if (!timeslots.length) return "";

  type Group = { start: string; end: string; days: Set<RoomAssignmentDay> };
  const groups = new Map<string, Group>();

  for (const slot of timeslots) {
    const start = slot.start_time ?? "";
    const end = slot.end_time ?? "";
    if (!start || !end) continue;
    const key = `${start}|${end}`;
    let group = groups.get(key);
    if (!group) {
      group = { start, end, days: new Set() };
      groups.set(key, group);
    }
    for (const day of ROOM_ASSIGNMENT_DAYS) {
      if (timeslotMatchesDay(slot, day)) group.days.add(day);
    }
    if (group.days.size === 0) {
      for (const day of daysPresentInSlots([slot])) group.days.add(day);
    }
  }

  const parts = Array.from(groups.values())
    .sort(
      (a, b) =>
        parseMinutes(a.start) - parseMinutes(b.start) ||
        parseMinutes(a.end) - parseMinutes(b.end),
    )
    .map((group) => {
      const orderedDays = ROOM_ASSIGNMENT_DAYS.filter((d) => group.days.has(d));
      const dayPart = compactSocDays(orderedDays);
      const timePart = `${formatTimeAmPmCompact(group.start)} - ${formatTimeAmPmCompact(group.end)}`;
      return dayPart ? `${dayPart} ${timePart}` : timePart;
    })
    .filter(Boolean);

  return parts.join("; ");
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

const QUARTER_MINUTES = 15;

function windowStartMinutes(): number {
  return SCHEDULING_WINDOW_START_HOUR * 60;
}

function windowEndMinutes(): number {
  return SCHEDULING_WINDOW_END_HOUR * 60;
}

/** Number of 15-minute columns in the scheduling window (e.g. 8:00–22:00 → 56). */
function quarterColumnCount(): number {
  return Math.max(
    0,
    Math.floor((windowEndMinutes() - windowStartMinutes()) / QUARTER_MINUTES),
  );
}

/** Hour labels for header merges (one per clock hour in the window). */
function hourHeaderLabels(): string[] {
  return Array.from(
    { length: Math.max(SCHEDULING_WINDOW_END_HOUR - SCHEDULING_WINDOW_START_HOUR, 0) },
    (_, idx) => {
      const h24 = SCHEDULING_WINDOW_START_HOUR + idx;
      const suffix = h24 >= 12 ? "PM" : "AM";
      const h12 = ((h24 + 11) % 12) + 1;
      return `${h12}${suffix}`;
    },
  );
}

/**
 * Map [startMin, endMin) onto 15-minute grid columns.
 * Floors the start and ceils the end so off-grid times still occupy a contiguous block.
 */
function quarterSpanColumns(
  startMin: number,
  endMin: number,
): { startCol: number; endCol: number } | null {
  const colCount = quarterColumnCount();
  if (colCount <= 0 || endMin <= startMin) return null;

  const origin = windowStartMinutes();
  let startIdx = Math.floor((startMin - origin) / QUARTER_MINUTES);
  let endIdx = Math.ceil((endMin - origin) / QUARTER_MINUTES) - 1;

  startIdx = Math.max(0, Math.min(colCount - 1, startIdx));
  endIdx = Math.max(startIdx, Math.min(colCount - 1, endIdx));
  return { startCol: startIdx, endCol: endIdx };
}

function departmentKey(section: RoomAssignmentSection): string {
  const d = String(section.department ?? "").trim();
  if (d) return d.toUpperCase();
  return "UNSPECIFIED";
}

function paletteForDepartment(key: string, indexByKey: Map<string, number>): {
  bg: string;
  border: string;
} {
  let index = indexByKey.get(key);
  if (index == null) {
    index = indexByKey.size;
    indexByKey.set(key, index);
  }
  return DEPARTMENT_PALETTE[index % DEPARTMENT_PALETTE.length];
}

function courseLinesForEvent(
  section: RoomAssignmentSection,
  peers: RoomAssignmentSection[] | undefined,
): string {
  if (peers && peers.length >= 2) {
    const lines = peers.map((peer) => {
      const cols = resolveAssignmentColumns(peer);
      const suffix = cols.section ? ` · ${cols.section}` : "";
      const head = [cols.subject, cols.number].filter(Boolean).join(" ");
      const withSec = head ? `${head}${suffix}` : cols.section;
      return cols.classTitle && cols.classTitle !== head
        ? `${withSec}\n${cols.classTitle}`
        : withSec || cols.classTitle;
    });
    return lines.filter(Boolean).join("\n");
  }

  const cols = resolveAssignmentColumns(section);
  const suffix = cols.section ? ` · ${cols.section}` : "";
  const head = [cols.subject, cols.number].filter(Boolean).join(" ");
  const withSec = head ? `${head}${suffix}` : cols.section;
  if (cols.classTitle && cols.classTitle !== head) {
    return `${withSec}\n${cols.classTitle}`.trim();
  }
  return withSec || cols.classTitle;
}

/** Course lines + actual clock range + instructor for the Excel card. */
function eventCellLabel(input: {
  section: RoomAssignmentSection;
  peers?: RoomAssignmentSection[];
  startTime: string;
  endTime: string;
  instructor: string;
  crosslistGroupId?: string;
  termBadge?: string | null;
}): string {
  const isCrosslist = (input.peers?.length ?? 0) >= 2;
  const course = courseLinesForEvent(input.section, input.peers);
  const timePart = `${formatTimeAmPmCompact(input.startTime)} - ${formatTimeAmPmCompact(input.endTime)}`;
  const instructor = input.instructor.trim();
  const crosslistHeader = isCrosslist
    ? input.crosslistGroupId
      ? `✕ Cross-list ${input.crosslistGroupId}`
      : "✕ Cross-list"
    : null;
  return [crosslistHeader, input.termBadge, course, timePart, instructor].filter(Boolean).join("\n");
}

function resolveDisplayHalvesForDay(
  day: RoomAssignmentDay,
  input: RoomAssignmentWorkbookInput,
): Map<string, "first_half" | "second_half"> {
  const timeslotById = new Map(input.timeslots.map((timeslot) => [timeslot.id, timeslot]));
  const placements: RoomSlotPlacement[] = [];

  for (const section of input.sections) {
    if (isSectionArchived(section) || isOnlineSection(section)) continue;
    const placement = input.assignments[section.id];
    const timeslotIds =
      placement?.timeslot_ids?.length
        ? placement.timeslot_ids
        : section.timeslot_id
          ? [section.timeslot_id]
          : [];
    const roomId = String(placement?.room_id ?? section.room_id ?? "").trim();
    if (!roomId) continue;
    for (const timeslotId of timeslotIds) {
      const slot = timeslotById.get(String(timeslotId));
      if (!slot || !timeslotMatchesDay(slot, day)) continue;
      placements.push({
        sectionId: section.id,
        roomId,
        startMin: parseMinutes(slot.start_time),
        endMin: parseMinutes(slot.end_time),
        semesterLength: section.semester_length,
        assignedHalf: placement?.assigned_half,
      });
    }
  }

  return resolveDisplayHalvesForRoomPlacements(placements);
}

export function buildAssignmentRows(input: RoomAssignmentWorkbookInput): string[][] {
  const instructorById = new Map(input.instructors.map((i) => [i.id, i]));
  const roomById = new Map(input.rooms.map((r) => [r.id, r]));
  const timeslotById = new Map(input.timeslots.map((t) => [t.id, t]));

  const rows = input.sections
    .filter((section) => !isSectionArchived(section))
    .map((section) => {
      const placement = input.assignments[section.id];
      const timeslotIds =
        placement?.timeslot_ids?.length
          ? placement.timeslot_ids
          : section.timeslot_id
            ? [section.timeslot_id]
            : [];
      const slots = timeslotIds
        .map((id) => timeslotById.get(String(id)))
        .filter((slot): slot is RoomAssignmentTimeslot => !!slot);

      const roomId = placement?.room_id ?? section.room_id ?? "";
      const room = roomId ? roomById.get(String(roomId)) : undefined;
      const cols = resolveAssignmentColumns(section);
      const instructor =
        instructorById.get(section.instructor_id)?.name?.trim() ||
        section.instructor_id ||
        "";
      const assignedHalf = placement?.assigned_half ?? null;

      return {
        instructor,
        subject: cols.subject,
        number: cols.number,
        classTitle: cols.classTitle,
        section: cols.section,
        duration: resolvedDurationLabel(section.semester_length, assignedHalf),
        daysAndTimes: formatDaysAndTimes(slots),
        roomNumber: isOnlineSection(section)
          ? "Online"
          : formatRoomLabel(room) || (roomId ? String(roomId) : ""),
      };
    })
    .sort((a, b) => {
      const bySubject = naturalCompare(a.subject, b.subject);
      if (bySubject !== 0) return bySubject;
      const byNumber = naturalCompare(a.number, b.number);
      if (byNumber !== 0) return byNumber;
      return naturalCompare(a.section, b.section);
    })
    .map((row) => [
      row.instructor,
      row.subject,
      row.number,
      row.classTitle,
      row.section,
      row.duration,
      row.daysAndTimes,
      row.roomNumber,
    ]);

  return rows;
}

export type GridEvent = {
  roomId: string;
  startMin: number;
  endMin: number;
  label: string;
  departmentKey: string;
  groupKey: string;
  isCrosslist: boolean;
  lane?: number;
  termStackRank?: number;
};

/** Assign non-overlapping lanes for concurrent events (mirrors calendar lane logic). */
export function assignEventLanes<T extends { startMin: number; endMin: number }>(
  events: T[],
  getStackRank?: (event: T) => number,
): (T & { lane: number })[] {
  const sorted = [...events].sort(
    (a, b) =>
      a.startMin - b.startMin ||
      a.endMin - b.endMin ||
      (getStackRank ? getStackRank(a) - getStackRank(b) : 0),
  );
  const laneEndTimes: number[] = [];
  return sorted.map((event) => {
    let lane = laneEndTimes.findIndex((laneEnd) => laneEnd <= event.startMin);
    if (lane === -1) {
      lane = laneEndTimes.length;
      laneEndTimes.push(event.endMin);
    } else {
      laneEndTimes[lane] = event.endMin;
    }
    return { ...event, lane };
  });
}

/**
 * Merge events that share the same time span into one stacked card.
 * Half-semester pairs (H1/H2) keep calendar order: H1 on top, H2 below.
 */
export function mergeConcurrentSlotEvents(events: GridEvent[]): GridEvent[] {
  const bySlot = new Map<string, GridEvent[]>();
  for (const event of events) {
    const key = `${event.startMin}::${event.endMin}`;
    const bucket = bySlot.get(key) ?? [];
    bucket.push(event);
    bySlot.set(key, bucket);
  }

  const merged: GridEvent[] = [];
  for (const bucket of Array.from(bySlot.values())) {
    if (bucket.length === 1) {
      merged.push(bucket[0]);
      continue;
    }

    const sorted = [...bucket].sort(
      (a, b) =>
        (a.termStackRank ?? 2) - (b.termStackRank ?? 2) ||
        a.label.localeCompare(b.label),
    );

    merged.push({
      ...sorted[0],
      label: sorted.map((event) => event.label).join("\n\n"),
      isCrosslist: sorted.some((event) => event.isCrosslist),
      termStackRank: Math.min(...sorted.map((event) => event.termStackRank ?? 2)),
    });
  }

  return merged.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

/** Row height (points) for grid event labels at 7pt wrapped text. */
export function estimateGridEventRowHeight(labels: Iterable<string>): number {
  let lineCount = 0;
  for (const label of Array.from(labels)) {
    lineCount += String(label).split("\n").length;
  }
  return Math.max(56, 18 + lineCount * 11);
}

export function collectDayEvents(
  day: RoomAssignmentDay,
  input: RoomAssignmentWorkbookInput,
): GridEvent[] {
  const timeslotById = new Map(input.timeslots.map((t) => [t.id, t]));
  const instructorById = new Map(input.instructors.map((i) => [i.id, i]));
  const displayHalves = resolveDisplayHalvesForDay(day, input);

  const membersByGroup = new Map<string, RoomAssignmentSection[]>();
  for (const section of input.sections) {
    if (isSectionArchived(section)) continue;
    const groupId = String(section.crosslist_group_id ?? "").trim();
    if (!groupId) continue;
    const members = membersByGroup.get(groupId) ?? [];
    members.push(section);
    membersByGroup.set(groupId, members);
  }

  const events: GridEvent[] = [];
  const seenGroupKeys = new Set<string>();

  for (const section of input.sections) {
    if (isSectionArchived(section)) continue;
    if (isOnlineSection(section)) continue;
    const placement = input.assignments[section.id];
    const timeslotIds =
      placement?.timeslot_ids?.length
        ? placement.timeslot_ids
        : section.timeslot_id
          ? [section.timeslot_id]
          : [];
    const slot = timeslotIds
      .map((id) => timeslotById.get(String(id)))
      .find((ts) => !!ts && timeslotMatchesDay(ts, day));
    if (!slot) continue;

    const roomId = String(placement?.room_id ?? section.room_id ?? "").trim();
    if (!roomId) continue;

    const startMin = parseMinutes(slot.start_time);
    const endMin = parseMinutes(slot.end_time);
    const groupId = String(section.crosslist_group_id ?? "").trim();
    const peers = groupId ? membersByGroup.get(groupId) : undefined;
    const labelSection = peers?.[0] ?? section;
    const instructor =
      instructorById.get(labelSection.instructor_id)?.name?.trim() ||
      labelSection.instructor_id ||
      "";

    const groupKey =
      peers && peers.length >= 2
        ? `${groupId}::${roomId}::${startMin}::${endMin}`
        : `section::${section.id}::${startMin}`;

    if (seenGroupKeys.has(groupKey)) continue;
    seenGroupKeys.add(groupKey);

    const isCrosslist = Boolean(peers && peers.length >= 2);
    const assignedHalf =
      displayAssignedHalfForSection(
        section.id,
        section.semester_length,
        displayHalves,
        input.assignments[section.id]?.assigned_half,
      ) ?? null;
    const badge = termBadgeLabel(section.semester_length, assignedHalf);

    events.push({
      roomId,
      startMin,
      endMin,
      label: eventCellLabel({
        section,
        peers,
        startTime: slot.start_time,
        endTime: slot.end_time,
        instructor,
        crosslistGroupId: isCrosslist ? groupId : undefined,
        termBadge: badge,
      }),
      departmentKey: departmentKey(labelSection),
      groupKey,
      isCrosslist,
      termStackRank: termStackRank(section.semester_length, assignedHalf),
    });
  }

  return events;
}

export function collectOnlineGridEvents(
  day: RoomAssignmentDay,
  input: RoomAssignmentWorkbookInput,
): GridEvent[] {
  const timeslotById = new Map(input.timeslots.map((t) => [t.id, t]));
  const instructorById = new Map(input.instructors.map((i) => [i.id, i]));

  const membersByGroup = new Map<string, RoomAssignmentSection[]>();
  for (const section of input.sections) {
    if (isSectionArchived(section)) continue;
    const groupId = String(section.crosslist_group_id ?? "").trim();
    if (!groupId) continue;
    const members = membersByGroup.get(groupId) ?? [];
    members.push(section);
    membersByGroup.set(groupId, members);
  }

  const events: GridEvent[] = [];
  const seenGroupKeys = new Set<string>();

  for (const section of input.sections) {
    if (isSectionArchived(section)) continue;
    if (!isOnlineSection(section)) continue;

    const placement = input.assignments[section.id];
    const timeslotIds =
      placement?.timeslot_ids?.length
        ? placement.timeslot_ids
        : section.timeslot_id
          ? [section.timeslot_id]
          : [];
    const slot = timeslotIds
      .map((id) => timeslotById.get(String(id)))
      .find((ts) => !!ts && timeslotMatchesDay(ts, day));
    if (!slot) continue;

    const startMin = parseMinutes(slot.start_time);
    const endMin = parseMinutes(slot.end_time);
    const groupId = String(section.crosslist_group_id ?? "").trim();
    const peers = groupId ? membersByGroup.get(groupId) : undefined;
    const labelSection = peers?.[0] ?? section;
    const instructor =
      instructorById.get(labelSection.instructor_id)?.name?.trim() ||
      labelSection.instructor_id ||
      "";

    const groupKey =
      peers && peers.length >= 2
        ? `${groupId}::online::${startMin}::${endMin}`
        : `section::${section.id}::${startMin}`;

    if (seenGroupKeys.has(groupKey)) continue;
    seenGroupKeys.add(groupKey);

    const isCrosslist = Boolean(peers && peers.length >= 2);
    const assignedHalf = input.assignments[section.id]?.assigned_half ?? null;
    const badge = termBadgeLabel(section.semester_length, assignedHalf);

    events.push({
      roomId: "",
      startMin,
      endMin,
      label: eventCellLabel({
        section,
        peers,
        startTime: slot.start_time,
        endTime: slot.end_time,
        instructor,
        crosslistGroupId: isCrosslist ? groupId : undefined,
        termBadge: badge,
      }),
      departmentKey: departmentKey(labelSection),
      groupKey,
      isCrosslist,
      termStackRank: termStackRank(section.semester_length, assignedHalf),
    });
  }

  return events;
}

function thinBorder(color = GRID_BORDER): Partial<ExcelJS.Borders> {
  const edge: Partial<ExcelJS.Border> = { style: "thin", color: { argb: `FF${color}` } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function applyAssignmentSheet(
  workbook: ExcelJS.Workbook,
  input: RoomAssignmentWorkbookInput,
): void {
  const sheet = workbook.addWorksheet("Room Assignments", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: ASSIGNMENT_HEADERS[0], key: "instructor", width: 28 },
    { header: ASSIGNMENT_HEADERS[1], key: "subject", width: 10 },
    { header: ASSIGNMENT_HEADERS[2], key: "number", width: 10 },
    { header: ASSIGNMENT_HEADERS[3], key: "classTitle", width: 42 },
    { header: ASSIGNMENT_HEADERS[4], key: "section", width: 10 },
    { header: ASSIGNMENT_HEADERS[5], key: "duration", width: 12 },
    { header: ASSIGNMENT_HEADERS[6], key: "daysAndTimes", width: 28 },
    { header: ASSIGNMENT_HEADERS[7], key: "roomNumber", width: 22 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${GRID_HEADER_FILL}` },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
  headerRow.height = 22;

  for (const values of buildAssignmentRows(input)) {
    const row = sheet.addRow(values);
    row.alignment = { vertical: "middle", wrapText: true };
    row.eachCell((cell) => {
      cell.border = thinBorder();
    });
  }

  const lastDataRow = Math.max(sheet.rowCount, 1);
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: lastDataRow, column: ASSIGNMENT_HEADERS.length },
  };
}

function paintGridRow(
  sheet: ExcelJS.Worksheet,
  excelRow: number,
  rowEvents: GridEvent[],
  colCount: number,
  deptIndexByKey: Map<string, number>,
  options?: {
    emptyFill?: string;
    roomCellValue?: string;
    roomCellFill?: string;
    paintRoomCell?: boolean;
  },
): void {
  const emptyFill = options?.emptyFill ?? GRID_EMPTY_FILL;
  const paintRoomCell = options?.paintRoomCell ?? true;
  const row = sheet.getRow(excelRow);
  row.height = 56;

  if (paintRoomCell) {
    const roomCell = row.getCell(1);
    roomCell.value = options?.roomCellValue ?? "";
    roomCell.font = { bold: true, size: 9, color: { argb: "FF0F172A" } };
    roomCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${options?.roomCellFill ?? GRID_ROOM_FILL}` },
    };
    roomCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    roomCell.border = thinBorder();
  }

  for (let c = 0; c < colCount; c += 1) {
    const cell = row.getCell(c + 2);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${emptyFill}` },
    };
    cell.border = thinBorder();
    cell.alignment = {
      vertical: "top",
      horizontal: "left",
      wrapText: true,
      shrinkToFit: false,
    };
  }

  const sortedEvents = mergeConcurrentSlotEvents(
    [...rowEvents].sort(
      (a, b) =>
        a.startMin - b.startMin ||
        a.endMin - b.endMin ||
        (a.termStackRank ?? 2) - (b.termStackRank ?? 2),
    ),
  );
  const occupied = new Array(colCount).fill(false);
  const paintedLabels: string[] = [];

  for (const event of sortedEvents) {
    const span = quarterSpanColumns(event.startMin, event.endMin);
    if (!span) continue;

    let startCol = span.startCol;
    let endCol = span.endCol;

    while (startCol <= endCol && occupied[startCol]) startCol += 1;
    if (startCol > endCol) {
      const cell = row.getCell(span.startCol + 2);
      const existing = cell.value != null ? String(cell.value) : "";
      cell.value = existing ? `${existing}\n\n${event.label}` : event.label;
      cell.alignment = {
        vertical: "top",
        horizontal: "left",
        wrapText: true,
      };
      paintedLabels.push(String(cell.value));
      continue;
    }

    let mergeEnd = startCol;
    while (mergeEnd + 1 <= endCol && !occupied[mergeEnd + 1]) mergeEnd += 1;

    for (let c = startCol; c <= mergeEnd; c += 1) occupied[c] = true;

    const excelStartCol = startCol + 2;
    const excelEndCol = mergeEnd + 2;
    if (excelEndCol > excelStartCol) {
      sheet.mergeCells(excelRow, excelStartCol, excelRow, excelEndCol);
    }

    const cell = row.getCell(excelStartCol);
    const palette = paletteForDepartment(event.departmentKey, deptIndexByKey);
    cell.value = event.label;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${palette.bg}` },
    };
    cell.font = { size: 7, bold: true, color: { argb: "FF0F172A" } };
    cell.alignment = {
      vertical: "top",
      horizontal: "left",
      wrapText: true,
    };
    const leftStyle = event.isCrosslist ? "thick" : "medium";
    cell.border = {
      top: {
        style: event.isCrosslist ? "medium" : "thin",
        color: { argb: `FF${palette.border}` },
      },
      left: { style: leftStyle, color: { argb: `FF${palette.border}` } },
      bottom: {
        style: event.isCrosslist ? "medium" : "thin",
        color: { argb: `FF${palette.border}` },
      },
      right: {
        style: event.isCrosslist ? "medium" : "thin",
        color: { argb: `FF${palette.border}` },
      },
    };

    paintedLabels.push(event.label);
  }

  if (paintedLabels.length) {
    row.height = estimateGridEventRowHeight(paintedLabels);
  }
}

function applyOnlineGridSection(
  sheet: ExcelJS.Worksheet,
  colCount: number,
  bandRow: number,
  day: RoomAssignmentDay,
  input: RoomAssignmentWorkbookInput,
  deptIndexByKey: Map<string, number>,
): { laneCount: number; events: GridEvent[] } {
  const onlineEvents = collectOnlineGridEvents(day, input);
  if (!onlineEvents.length) {
    return { laneCount: 0, events: [] };
  }

  const laned = assignEventLanes(onlineEvents, (event) => event.termStackRank ?? 2);
  const laneCount = laned.reduce((max, event) => Math.max(max, event.lane + 1), 0);

  const band = sheet.getRow(bandRow);
  band.height = 22;
  if (colCount > 0) {
    sheet.mergeCells(bandRow, 1, bandRow, colCount + 1);
  }
  const bandCell = band.getCell(1);
  bandCell.value = "Online";
  bandCell.font = { bold: true, size: 10, color: { argb: `FF${ONLINE_BAND_FONT}` } };
  bandCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${ONLINE_BAND_FILL}` },
  };
  bandCell.alignment = { vertical: "middle", horizontal: "center" };
  bandCell.border = thinBorder("7C3AED");

  const firstLaneRow = bandRow + 1;
  const lastLaneRow = bandRow + laneCount;

  for (let lane = 0; lane < laneCount; lane += 1) {
    const excelRow = firstLaneRow + lane;
    const laneEvents = laned
      .filter((event) => event.lane === lane)
      .map((event) => ({
        ...event,
        roomId: `${ONLINE_LANE_ROOM_ID_PREFIX}${lane}`,
      }));
    paintGridRow(sheet, excelRow, laneEvents, colCount, deptIndexByKey, {
      emptyFill: ONLINE_GRID_EMPTY_FILL,
      paintRoomCell: false,
    });
  }

  if (laneCount > 0) {
    sheet.mergeCells(firstLaneRow, 1, lastLaneRow, 1);
    const mergedRoomCell = sheet.getRow(firstLaneRow).getCell(1);
    mergedRoomCell.value = "";
    mergedRoomCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${ONLINE_GRID_EMPTY_FILL}` },
    };
    mergedRoomCell.border = thinBorder("C4B5FD");
    mergedRoomCell.alignment = { vertical: "middle", horizontal: "center" };
  }

  return { laneCount, events: laned };
}

function applyDayGridSheet(
  workbook: ExcelJS.Workbook,
  day: RoomAssignmentDay,
  input: RoomAssignmentWorkbookInput,
  deptIndexByKey: Map<string, number>,
): void {
  const colCount = quarterColumnCount();
  const hourLabels = hourHeaderLabels();
  const events = collectDayEvents(day, input);
  const roomById = new Map(input.rooms.map((r) => [r.id, r]));

  const knownRoomIds = new Set(input.rooms.map((r) => r.id));
  const orphanRoomIds = Array.from(
    new Set(events.map((e) => e.roomId).filter((id) => !knownRoomIds.has(id))),
  ).sort(naturalCompare);

  const rooms: Array<{ id: string; label: string }> = [
    ...input.rooms.map((room) => ({
      id: room.id,
      label: formatRoomLabel(room) || room.id,
    })),
    ...orphanRoomIds.map((id) => ({
      id,
      label: formatRoomLabel(roomById.get(id)) || id,
    })),
  ];

  const sheet = workbook.addWorksheet(day, {
    views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
  });

  sheet.getColumn(1).width = 18;
  for (let i = 0; i < colCount; i += 1) {
    sheet.getColumn(i + 2).width = 4.25;
  }

  const header = sheet.getRow(1);
  header.height = 24;
  const roomHeader = header.getCell(1);
  roomHeader.value = "Room";
  roomHeader.font = { bold: true, color: { argb: `FF${GRID_HEADER_FONT}` }, size: 10 };
  roomHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${GRID_HEADER_FILL}` },
  };
  roomHeader.alignment = { vertical: "middle", horizontal: "center" };
  roomHeader.border = thinBorder("334155");

  // Style all quarter cells, then merge each hour group (4 × 15 min) under one label.
  for (let c = 0; c < colCount; c += 1) {
    const cell = header.getCell(c + 2);
    cell.font = { bold: true, color: { argb: `FF${GRID_HEADER_FONT}` }, size: 9 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${GRID_HEADER_FILL}` },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder("334155");
  }

  hourLabels.forEach((label, hourIdx) => {
    const startCol = hourIdx * 4 + 2;
    const endCol = Math.min(startCol + 3, colCount + 1);
    if (endCol < startCol) return;
    if (endCol > startCol) {
      sheet.mergeCells(1, startCol, 1, endCol);
    }
    const cell = header.getCell(startCol);
    cell.value = label;
    cell.font = { bold: true, color: { argb: `FF${GRID_HEADER_FONT}` }, size: 9 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${GRID_HEADER_FILL}` },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder("334155");
  });

  rooms.forEach((room, roomIndex) => {
    const excelRow = roomIndex + 2;
    const roomEvents = events.filter((e) => e.roomId === room.id);
    paintGridRow(sheet, excelRow, roomEvents, colCount, deptIndexByKey, {
      roomCellValue: room.label,
      roomCellFill: GRID_ROOM_FILL,
    });
  });

  const bandRow = rooms.length + 2;
  const { laneCount: onlineLaneCount, events: onlineGridEvents } = applyOnlineGridSection(
    sheet,
    colCount,
    bandRow,
    day,
    input,
    deptIndexByKey,
  );
  const onlineBlockRows = onlineGridEvents.length ? 1 + onlineLaneCount : 0;

  const allGridEvents = [...events, ...onlineGridEvents];

  // Department color legend at the bottom
  const legendStart = rooms.length + onlineBlockRows + 4;
  const legendTitle = sheet.getRow(legendStart);
  legendTitle.getCell(1).value = "Department colors";
  legendTitle.getCell(1).font = { bold: true, size: 10, color: { argb: "FF475569" } };

  const usedDepts = Array.from(
    new Set(allGridEvents.map((e) => e.departmentKey)),
  ).sort(naturalCompare);

  usedDepts.forEach((key, idx) => {
    const legendRow = sheet.getRow(legendStart + 1 + idx);
    const swatch = legendRow.getCell(1);
    const palette = paletteForDepartment(key, deptIndexByKey);
    swatch.value = key === "UNSPECIFIED" ? "Unspecified" : key;
    swatch.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${palette.bg}` },
    };
    swatch.font = { size: 9, bold: true };
    swatch.border = {
      top: { style: "thin", color: { argb: `FF${palette.border}` } },
      left: { style: "medium", color: { argb: `FF${palette.border}` } },
      bottom: { style: "thin", color: { argb: `FF${palette.border}` } },
      right: { style: "thin", color: { argb: `FF${palette.border}` } },
    };
    swatch.alignment = { vertical: "middle", horizontal: "left" };
    legendRow.height = 18;
  });

  if (allGridEvents.some((e) => e.isCrosslist)) {
    const noteRow = sheet.getRow(legendStart + 1 + usedDepts.length + 1);
    noteRow.getCell(1).value =
      "✕ Cross-list cards list every linked course and use a thicker border.";
    noteRow.getCell(1).font = { size: 9, italic: true, color: { argb: "FF64748B" } };
  }
}

export async function buildRoomAssignmentWorkbook(
  input: RoomAssignmentWorkbookInput,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WSOM Course Scheduler";
  workbook.created = new Date();

  applyAssignmentSheet(workbook, input);

  const deptIndexByKey = new Map<string, number>();
  for (const day of ROOM_ASSIGNMENT_DAYS) {
    applyDayGridSheet(workbook, day, input, deptIndexByKey);
  }

  return workbook;
}

export async function workbookToArrayBuffer(
  workbook: ExcelJS.Workbook,
): Promise<ArrayBuffer> {
  const buffer = await workbook.xlsx.writeBuffer();
  if (buffer instanceof ArrayBuffer) return buffer;
  const bytes = new Uint8Array(buffer as unknown as ArrayBuffer);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function roomAssignmentFilename(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `room_assignments_${yyyy}-${mm}-${dd}.xlsx`;
}

/** Trigger a browser download of the room-assignment workbook. */
export async function downloadRoomAssignmentWorkbook(
  input: RoomAssignmentWorkbookInput,
): Promise<void> {
  const workbook = await buildRoomAssignmentWorkbook(input);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = roomAssignmentFilename();
  anchor.click();
  URL.revokeObjectURL(url);
}

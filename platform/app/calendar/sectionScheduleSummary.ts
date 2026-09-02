import type { TimeslotDto } from "./calendarTypes";
import { canonicalizeRoomNumber } from "@/lib/scheduling/roomNumber";
import { isOnlineSection } from "@/lib/scheduling/sectionOnline";

export const SCHEDULE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
export type ScheduleDay = (typeof SCHEDULE_DAYS)[number];

export type SectionScheduleMember = {
  id: string;
  room_id?: string | null;
  timeslot_id?: string | null;
  section_number?: string | null;
};

export type SectionScheduleRoom = {
  id: string;
  building?: string;
  room_number?: string;
};

export type CalendarAssignmentLike = {
  timeslot_ids?: string[];
  room_id?: string;
  meeting_pattern_id?: string;
};

export type SectionScheduleSummary = {
  isScheduled: boolean;
  dayLabels: string[];
  slotLines: string[];
  roomLabel: string | null;
  isOnline: boolean;
  assignedMeetingPatternId: string | null;
};

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((part) => Number(part));
  return (h || 0) * 60 + (m || 0);
}

export function formatScheduleTimeAmPm(hhmm: string): string {
  const minutes = parseMinutes(hhmm);
  const h24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${mins.toString().padStart(2, "0")} ${suffix}`;
}

function timeslotMatchesDay(timeslot: TimeslotDto, selected: ScheduleDay): boolean {
  const raw = String(timeslot.days ?? timeslot.day ?? "").trim();
  if (!raw) return false;
  return raw.split(/[/,\s]+/).some((part) => part.trim() === selected);
}

function formatRoomLabel(roomId: string | null, rooms: SectionScheduleRoom[]): string | null {
  if (!roomId) return null;
  const room = rooms.find((entry) => entry.id === roomId);
  if (!room) return roomId;
  const label = [room.building, canonicalizeRoomNumber(room.room_number)]
    .filter(Boolean)
    .join(" ");
  return label || room.id;
}

export function describeSectionsSchedule(input: {
  members: SectionScheduleMember[];
  assignmentsBySection: Record<string, CalendarAssignmentLike | undefined>;
  solverTimeslotIdsBySection: Record<string, string[]>;
  timeslotById: Map<string, TimeslotDto>;
  rooms: SectionScheduleRoom[];
  assignedMeetingPatternId?: string | null;
}): SectionScheduleSummary {
  const {
    members,
    assignmentsBySection,
    solverTimeslotIdsBySection,
    timeslotById,
    rooms,
    assignedMeetingPatternId,
  } = input;

  const timeslotIdSet = new Set<string>();
  let roomId: string | null = null;
  let meetingPatternId =
    String(assignedMeetingPatternId ?? "").trim() ||
    String(assignmentsBySection[members[0]?.id ?? ""]?.meeting_pattern_id ?? "").trim() ||
    null;

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
    if (!meetingPatternId) {
      meetingPatternId = String(assignmentsBySection[member.id]?.meeting_pattern_id ?? "").trim() || null;
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

  const dayLabels = SCHEDULE_DAYS.filter((day) =>
    slots.some((slot) => timeslotMatchesDay(slot, day)),
  );

  const slotLines = slots.map((slot) => {
    const daysRaw = String(slot.days ?? slot.day ?? "").trim();
    const dayPart = daysRaw || dayLabels.join("/") || "—";
    return `${dayPart} · ${formatScheduleTimeAmPm(slot.start_time)}–${formatScheduleTimeAmPm(slot.end_time)}`;
  });

  const isOnline = members.some((member) => isOnlineSection(member));
  const roomLabel = isOnline ? "Online band" : formatRoomLabel(roomId, rooms);

  return {
    isScheduled: slots.length > 0,
    dayLabels: [...dayLabels],
    slotLines,
    roomLabel,
    isOnline,
    assignedMeetingPatternId: meetingPatternId,
  };
}

export function describeSectionSchedule(
  section: SectionScheduleMember,
  assignmentsBySection: Record<string, CalendarAssignmentLike | undefined>,
  solverTimeslotIdsBySection: Record<string, string[]>,
  timeslotById: Map<string, TimeslotDto>,
  rooms: SectionScheduleRoom[],
  assignedMeetingPatternId?: string | null,
): SectionScheduleSummary {
  return describeSectionsSchedule({
    members: [section],
    assignmentsBySection,
    solverTimeslotIdsBySection,
    timeslotById,
    rooms,
    assignedMeetingPatternId,
  });
}

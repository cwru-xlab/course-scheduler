import type { TimeslotDto } from "./calendarTypes";

export type CalendarSectionLike = {
  id: string;
  course_id: string | number;
  department?: string | null;
  section_code: string;
  instructor_id: string;
  crosslist_group_id?: string | null;
  room_id?: string | null;
  timeslot_id?: string | null;
};

export type RawCalendarEvent = {
  section: CalendarSectionLike;
  timeslot: TimeslotDto;
  start: number;
  end: number;
};

export type CalendarEvent = RawCalendarEvent & {
  lane?: number;
  crosslistGroupId?: string;
  crosslistMembers?: CalendarSectionLike[];
};

export function isCrosslistGroupEvent(event: CalendarEvent): boolean {
  return (event.crosslistMembers?.length ?? 0) >= 2;
}

export function eventIncludesSection(event: CalendarEvent, sectionId: string): boolean {
  if (event.crosslistMembers?.length) {
    return event.crosslistMembers.some((member) => member.id === sectionId);
  }
  return event.section.id === sectionId;
}

export function findCalendarEventBySectionId(
  events: CalendarEvent[],
  sectionId: string,
): CalendarEvent | undefined {
  return events.find(
    (event) => eventIncludesSection(event, sectionId) && event.timeslot,
  );
}

export function getCalendarEventKey(event: CalendarEvent, roomId: string): string {
  if (isCrosslistGroupEvent(event)) {
    return `crosslist-${roomId}-${event.crosslistGroupId}-${event.start}-${event.end}`;
  }
  return `section-${roomId}-${event.section.id}`;
}

export function mergeCrosslistCalendarEvents(
  rawEvents: RawCalendarEvent[],
): CalendarEvent[] {
  const standalone: CalendarEvent[] = [];
  const buckets = new Map<string, RawCalendarEvent[]>();

  for (const event of rawEvents) {
    const groupId = String(event.section.crosslist_group_id ?? "").trim();
    if (!groupId) {
      standalone.push({ ...event });
      continue;
    }
    const roomId = event.section.room_id ?? "";
    const bucketKey = `${groupId}::${roomId}::${event.start}::${event.end}`;
    const bucket = buckets.get(bucketKey) ?? [];
    bucket.push(event);
    buckets.set(bucketKey, bucket);
  }

  const merged: CalendarEvent[] = [...standalone];
  for (const bucketEvents of Array.from(buckets.values())) {
    if (bucketEvents.length >= 2) {
      const members = bucketEvents
        .map((event) => event.section)
        .sort((a, b) => a.id.localeCompare(b.id));
      const groupId = String(members[0]?.crosslist_group_id ?? "").trim();
      merged.push({
        ...bucketEvents[0],
        section: members[0],
        crosslistGroupId: groupId,
        crosslistMembers: members,
      });
    } else if (bucketEvents.length === 1) {
      merged.push({ ...bucketEvents[0] });
    }
  }

  return merged.sort((a, b) => a.start - b.start);
}

export function assignCalendarEventLanes<T extends { start: number; end: number }>(
  events: T[],
): (T & { lane: number })[] {
  const laneEndTimes: number[] = [];
  return events.map((event) => {
    let lane = laneEndTimes.findIndex((laneEnd) => laneEnd <= event.start);
    if (lane === -1) {
      lane = laneEndTimes.length;
      laneEndTimes.push(event.end);
    } else {
      laneEndTimes[lane] = event.end;
    }
    return { ...event, lane };
  });
}

export function calendarEventMatchesFilters(
  event: CalendarEvent,
  matchesSection: (section: CalendarSectionLike) => boolean,
): boolean {
  if (event.crosslistMembers?.length) {
    return event.crosslistMembers.some(matchesSection);
  }
  return matchesSection(event.section);
}

export function calendarEventConflictsWithSectionIds(
  event: CalendarEvent,
  sectionIds: Set<string>,
): boolean {
  if (event.crosslistMembers?.length) {
    return !event.crosslistMembers.some((member) => sectionIds.has(member.id));
  }
  return !sectionIds.has(event.section.id);
}

export function getCalendarEventRoomId(
  event: CalendarEvent,
  roomIdForSection: (sectionId: string) => string,
): string {
  if (event.crosslistMembers?.length) {
    return event.section.room_id ?? roomIdForSection(event.section.id) ?? "";
  }
  return roomIdForSection(event.section.id) || event.section.room_id || "";
}

export function calendarEventDisplayLabel(event: CalendarEvent): string {
  if (isCrosslistGroupEvent(event)) {
    return event.crosslistGroupId ?? "Cross-list";
  }
  return `${event.section.department ?? ""} ${event.section.course_id}`.trim();
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  BarChart3,
  Filter,
  Maximize2,
  Minimize2,
  Palette,
  Printer,
  Rocket,
  Share2,
} from "lucide-react";
import type { ScheduleSolution, SchedulingInput } from "@/lib/scheduling/types";

type TimeslotDto = {
  id: string;
  days?: string; // solver model
  day?: string; // legacy frontend shape
  start_time: string;
  end_time: string;
  slot_type?: string;
};

type InstructorDto = {
  id: string;
  name?: string;
  rank_type?: string;
  unavailable_times?: string[];
  preferences?: {
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

type LastSolverRun = {
  input: SchedulingInput;
  solution: ScheduleSolution;
  createdAt: string;
};

const LAST_SOLVER_RUN_STORAGE_KEY = "wsom-last-solver-run";

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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const EVENT_HEIGHT_PX = 70;
const EVENT_GAP_PX = 8;
const EVENT_TOP_PADDING_PX = 12;
const MIN_TRACK_HEIGHT_PX = 240;
const COURSE_COLOR_CLASSES = [
  { bg: "bg-[#137fec]/20", border: "border-[#137fec]" },
  { bg: "bg-emerald-500/20", border: "border-emerald-500" },
  { bg: "bg-amber-500/20", border: "border-amber-500" },
  { bg: "bg-rose-500/20", border: "border-rose-500" },
  { bg: "bg-indigo-500/20", border: "border-indigo-500" },
  { bg: "bg-cyan-500/20", border: "border-cyan-500" },
  { bg: "bg-violet-500/20", border: "border-violet-500" },
  { bg: "bg-orange-500/20", border: "border-orange-500" },
];

const COURSE_PRINT_COLORS = [
  { bg: "#dbeafe", border: "#137fec" },
  { bg: "#dcfce7", border: "#22c55e" },
  { bg: "#fef3c7", border: "#f59e0b" },
  { bg: "#ffe4e6", border: "#f43f5e" },
  { bg: "#e0e7ff", border: "#6366f1" },
  { bg: "#cffafe", border: "#06b6d4" },
  { bg: "#ede9fe", border: "#8b5cf6" },
  { bg: "#ffedd5", border: "#f97316" },
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

function colorClassForScheduleSection(section: { department?: string | null; course_id: string | number }) {
  const key = departmentColorKey(section);
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return COURSE_COLOR_CLASSES[hash % COURSE_COLOR_CLASSES.length];
}

function printColorForScheduleSection(section: { department?: string | null; course_id: string | number }) {
  const key = departmentColorKey(section);
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return COURSE_PRINT_COLORS[hash % COURSE_PRINT_COLORS.length];
}

export default function CalendarPage() {
  type AssignmentMap = Record<
    string,
    { timeslot_ids: string[]; room_id: string; meeting_pattern_id: string }
  >;

  const [selectedDay, setSelectedDay] = useState<Day>("Mon");
  const [data, setData] = useState<SolverDataDto | null>(null);
  const [solverInput, setSolverInput] = useState<SchedulingInput | null>(null);
  const [assignmentsBySection, setAssignmentsBySection] = useState<AssignmentMap>({});
  const [baselineAssignments, setBaselineAssignments] = useState<AssignmentMap>({});
  const [error, setError] = useState<string | null>(null);
  const [solverTimeslotIdsBySection, setSolverTimeslotIdsBySection] = useState<
    Record<string, string[]>
  >({});
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  const [dragFeedback, setDragFeedback] = useState<{
    status: "neutral" | "valid" | "invalid";
    message: string | null;
  }>({ status: "neutral", message: null });
  const [isSavingBackend, setIsSavingBackend] = useState(false);
  const [backendSaveMessage, setBackendSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<{
    section: SectionDto;
    timeslot: TimeslotDto;
    room: RoomDto;
    professor: InstructorDto | null;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (typeof window !== "undefined") {
          const raw = localStorage.getItem(LAST_SOLVER_RUN_STORAGE_KEY);
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as LastSolverRun;
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
              }));

              const instructorsFromSolver = parsed.input.instructors.map(
                (instructor) => ({
                  id: instructor.id,
                  name: instructor.name || instructor.id,
                }),
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

  const axisStart = 9 * 60; // 9:00 AM
  const axisEnd = 21 * 60; // 9:00 PM
  const axisRange = axisEnd - axisStart;

  const timeAxisLabels = [
    "9AM",
    "10AM",
    "11AM",
    "12PM",
    "1PM",
    "2PM",
    "3PM",
    "4PM",
    "5PM",
    "6PM",
    "7PM",
    "8PM",
  ];
  const hourSegments = timeAxisLabels.length;

  const instructorById = useMemo(() => {
    const map = new Map<string, InstructorDto>();
    data?.instructors.forEach((i) => map.set(i.id, i));
    return map;
  }, [data]);

  /** One swatch per department code (shared across all courses in that dept). */
  const departmentColorLegend = useMemo(() => {
    if (!data?.sections.length) return [];
    const byKey = new Map<
      string,
      { colorKey: string; label: string; swatch: { bg: string; border: string } }
    >();
    for (const s of data.sections) {
      const colorKey = departmentColorKey(s);
      if (byKey.has(colorKey)) continue;
      const swatch = colorClassForScheduleSection(s);
      const label = departmentLegendLabel(s);
      byKey.set(colorKey, { colorKey, label, swatch });
    }
    return Array.from(byKey.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
  }, [data]);

  const dayEvents = useMemo(() => {
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

  const getDayEvents = (day: Day) => {
    if (!data) return [];
    const baseEvents = data.sections
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

  const eventsByRoom = useMemo(() => {
    const byRoom = new Map<string, typeof dayEvents>();
    dayEvents.forEach((event) => {
      const roomId = event.section.room_id;
      if (!roomId) return;
      if (!byRoom.has(roomId)) byRoom.set(roomId, []);
      byRoom.get(roomId)?.push(event);
    });
    return byRoom;
  }, [dayEvents]);

  const roomRows = useMemo(() => {
    if (!data) return [];
    return data.rooms.map((room) => {
      const roomEvents = [...(eventsByRoom.get(room.id) ?? [])].sort(
        (a, b) => a.start - b.start,
      );
      const laneEndTimes: number[] = [];
      const events = roomEvents.map((event) => {
        let lane = laneEndTimes.findIndex((laneEnd) => laneEnd <= event.start);
        if (lane === -1) {
          lane = laneEndTimes.length;
          laneEndTimes.push(event.end);
        } else {
          laneEndTimes[lane] = event.end;
        }
        return { ...event, lane };
      });
      const laneCount = events.reduce((max, event) => Math.max(max, event.lane + 1), 0);
      const needed =
        EVENT_TOP_PADDING_PX * 2 +
        laneCount * EVENT_HEIGHT_PX +
        Math.max(0, laneCount - 1) * EVENT_GAP_PX;
      return { room, events, rowHeight: Math.max(100, needed) };
    });
  }, [data, eventsByRoom]);

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

  const updateLastRunStorage = (
    nextInput: SchedulingInput,
    assignments: AssignmentMap,
  ) => {
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
        createdAt: new Date().toISOString(),
      }),
    );
  };

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

  const handleDropOnRoomRow = (event: React.DragEvent<HTMLDivElement>, targetRoomId: string) => {
    event.preventDefault();
    if (!data || !draggedSectionId) return;

    const dragged = dayEvents.find((x) => x.section.id === draggedSectionId && x.timeslot);
    if (!dragged || !dragged.timeslot) return;

    const rowRect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rowRect.left;
    const pct = clamp(x / rowRect.width, 0, 1);
    const dropMinutes = axisStart + pct * axisRange;
    const duration = dragged.end - dragged.start;

    const daySlots = data.timeslots
      .filter((slot) => timeslotMatchesDay(slot, selectedDay))
      .map((slot) => ({
        ...slot,
        start: parseMinutes(slot.start_time),
        end: parseMinutes(slot.end_time),
      }))
      .filter((slot) => Math.abs(slot.end - slot.start - duration) <= 5);

    const selectedSlot = daySlots.sort(
      (a, b) => Math.abs(a.start - dropMinutes) - Math.abs(b.start - dropMinutes),
    )[0];

    if (!selectedSlot) {
      setDragFeedback({
        status: "invalid",
        message: `Unable to place ${dragged.section.course_id}: no compatible ${selectedDay} timeslot found for this class duration.`,
      });
      setDraggedSectionId(null);
      return;
    }

    const currentAssignment = assignmentsBySection[draggedSectionId];
    const currentRoomId = currentAssignment?.room_id ?? dragged.section.room_id ?? "";
    const targetRoom = data.rooms.find((room) => room.id === targetRoomId);
    const requiredSeats =
      dragged.section.enrollment_cap ??
      dragged.section.expected_enrollment ??
      0;
    if (
      targetRoomId !== currentRoomId &&
      Number.isFinite(targetRoom?.capacity) &&
      requiredSeats > (targetRoom?.capacity ?? 0)
    ) {
      setDragFeedback({
        status: "invalid",
        message: `Invalid: ${dragged.section.department ?? ""} ${dragged.section.course_id} requires ${requiredSeats} seats, but room ${targetRoomId} capacity is ${targetRoom?.capacity}.`,
      });
      setDraggedSectionId(null);
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
    const nextAssignments: AssignmentMap = {
      ...assignmentsBySection,
      [draggedSectionId]: {
        timeslot_ids: uniqueNextTimeslotIds,
        room_id: targetRoomId,
        meeting_pattern_id: currentAssignment?.meeting_pattern_id ?? "",
      },
    };
    setAssignmentsBySection(nextAssignments);
    setSolverTimeslotIdsBySection((prev) => ({
      ...prev,
      [draggedSectionId]: uniqueNextTimeslotIds,
    }));

    const selectedStart = parseMinutes(selectedSlot.start_time);
    const selectedEnd = parseMinutes(selectedSlot.end_time);
    const conflicts = dayEvents.filter((eventItem) => {
      if (eventItem.section.id === draggedSectionId) return false;
      const itemRoomId =
        nextAssignments[eventItem.section.id]?.room_id ?? eventItem.section.room_id ?? "";
      if (itemRoomId !== targetRoomId) return false;
      // Conflict if the intervals overlap in the same room on the selected day.
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
    setDraggedSectionId(null);
  };

  const handleUpdateBackend = async () => {
    if (!solverInput || !hasValidUnsavedEdit) return;
    setIsSavingBackend(true);
    setBackendSaveMessage(null);
    try {
      const mergedSections = solverInput.sections.map((section) => {
        const assignment = assignmentsBySection[section.id];
        return {
          ...section,
          room_id: assignment?.room_id ?? (section as unknown as { room_id?: string | null }).room_id ?? null,
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
      setBaselineAssignments(assignmentsBySection);
      updateLastRunStorage(solverInput, assignmentsBySection);
      setBackendSaveMessage({
        type: "success",
        text: "Backend updated with the current valid calendar edits.",
      });
    } catch (err) {
      setBackendSaveMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update backend.",
      });
    } finally {
      setIsSavingBackend(false);
    }
  };

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
            className="flex items-center justify-center rounded-lg h-10 px-4 bg-slate-100 text-slate-900 font-bold gap-2 border border-slate-200"
            onClick={handleExportPdf}
          >
            <Share2 className="size-4" />
            Export PDF
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

      {/* Day selector (Mon-Fri) */}
      <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
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
        <div className="flex items-center gap-1 ml-4 pl-4 border-l border-slate-200">
          <button className="p-2 text-slate-500 hover:text-[#137fec] transition-colors">
            <Maximize2 className="size-4" />
          </button>
          <button className="p-2 text-slate-500 hover:text-[#137fec] transition-colors">
            <Minimize2 className="size-4" />
          </button>
          <button className="p-2 text-slate-500 hover:text-[#137fec] transition-colors">
            <Filter className="size-4" />
          </button>
          <button className="p-2 text-slate-500 hover:text-[#137fec] transition-colors">
            <Printer className="size-4" />
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
                className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 mr-1 mb-1"
              >
                <span
                  className={clsx(
                    "h-3.5 w-6 shrink-0 rounded border-l-[3px] shadow-sm",
                    item.swatch.bg,
                    item.swatch.border,
                  )}
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
        {(dragFeedback.message || dragError) && (
          <div
            className={clsx(
              "border-b px-4 py-3 text-sm font-medium",
              dragFeedback.status === "valid"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700",
            )}
          >
            {dragFeedback.message ?? dragError}
          </div>
        )}
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

        <div className="flex-1 overflow-y-auto relative">
          <div className="flex border-b border-slate-200/80 min-h-[240px]">
            <div className="w-40 flex-shrink-0 border-r border-slate-200 bg-slate-50/30">
              {roomRows.map(({ room, rowHeight }) => {
                const roomLabel = [room.building, room.room_number]
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
            <div className="flex-1">
              {roomRows.map(({ room, events, rowHeight }) => (
                <div
                  key={room.id}
                  className="relative border-b border-slate-200/80 last:border-b-0"
                  style={{ minHeight: rowHeight }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => void handleDropOnRoomRow(e, room.id)}
                >
                  <div
                    className="absolute inset-0 grid pointer-events-none"
                    style={{ gridTemplateColumns: `repeat(${hourSegments}, minmax(0, 1fr))` }}
                  >
                    {Array.from({ length: hourSegments }).map((_, j) => (
                  <div
                    key={j}
                        className="border-r border-slate-300/50 last:border-r-0"
                  />
                ))}
              </div>
                  {draggedSectionId &&
                    dayTimeslotBoundaries.map((minute) => {
                      const leftPct = ((minute - axisStart) / axisRange) * 100;
                      return (
                        <div
                          key={`${room.id}-boundary-${minute}`}
                          className="absolute top-0 bottom-0 border-l border-red-300/70 pointer-events-none"
                          style={{ left: `${leftPct}%` }}
                        />
                      );
                    })}

                  {events.map(({ section, timeslot, start, end, lane }) => {
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
                    const color = colorClassForScheduleSection(section);

                return (
                  <div
                        key={`${room.id}-${section.id}`}
                    className={clsx(
                      "absolute border-l-4 rounded-lg p-2.5 flex flex-col justify-between cursor-pointer transition-all z-10 shadow-sm hover:shadow-md",
                          "active:cursor-grabbing",
                          color.bg,
                          color.border,
                        )}
                        draggable={!!solverInput}
                        onDragStart={() => {
                          setDraggedSectionId(section.id);
                          setDragError(null);
                          setBackendSaveMessage(null);
                        }}
                        onDragEnd={() => setDraggedSectionId(null)}
                    style={{
                      left: `${leftPct * 100}%`,
                          width: `${Math.max(widthPct * 100, 0.5)}%`,
                          top,
                          height: EVENT_HEIGHT_PX,
                        }}
                        onClick={() =>
                          setSelectedEvent({
                            section,
                            timeslot: timeslot!,
                            room,
                            professor: inst ?? null,
                          })
                        }
                        title={`${title} • ${professor} • ${timeLabel} • Room ${room.id}`}
                  >
                      <div className="font-black text-[10px] truncate text-slate-900">
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

      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-black text-slate-900">Section Details</h3>
              <button
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
                onClick={() => setSelectedEvent(null)}
              >
                Close
              </button>
            </div>

            <div className="space-y-6 px-6 py-5 text-sm">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Section
                </h4>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div><span className="font-semibold">Section ID:</span> {selectedEvent.section.id}</div>
                  <div>
                    <span className="font-semibold">Department:</span>{" "}
                    {(selectedEvent.section.department ?? "").trim() || "—"}
                  </div>
                  <div><span className="font-semibold">Course ID:</span> {selectedEvent.section.course_id}</div>
                  <div><span className="font-semibold">Section Code:</span> {selectedEvent.section.section_code}</div>
                  <div><span className="font-semibold">Instructor ID:</span> {selectedEvent.section.instructor_id}</div>
                  <div>
                    <span className="font-semibold">Expected Enrollment:</span>{" "}
                    {selectedEvent.section.expected_enrollment ?? "N/A"}
                  </div>
                  <div>
                    <span className="font-semibold">Enrollment Cap:</span>{" "}
                    {selectedEvent.section.enrollment_cap ?? "N/A"}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="font-semibold">Allowed Patterns:</span>{" "}
                    {selectedEvent.section.allowed_meeting_patterns?.join(", ") || "N/A"}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="font-semibold">Room Requirements:</span>{" "}
                    {selectedEvent.section.room_requirements?.join(", ") || "None"}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Professor
                </h4>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div><span className="font-semibold">Name:</span> {selectedEvent.professor?.name || "N/A"}</div>
                  <div><span className="font-semibold">ID:</span> {selectedEvent.professor?.id || selectedEvent.section.instructor_id}</div>
                  <div><span className="font-semibold">Rank:</span> {selectedEvent.professor?.rank_type || "N/A"}</div>
                  <div>
                    <span className="font-semibold">Max Teaching Days:</span>{" "}
                    {selectedEvent.professor?.preferences?.max_teaching_days ?? "N/A"}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="font-semibold">Preferred Days:</span>{" "}
                    {selectedEvent.professor?.preferences?.preferred_days?.join(", ") || "N/A"}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="font-semibold">Preferred Patterns:</span>{" "}
                    {selectedEvent.professor?.preferences?.preferred_patterns?.join(", ") || "N/A"}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Meeting
                </h4>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div><span className="font-semibold">Room:</span> {selectedEvent.room.id}</div>
                  <div>
                    <span className="font-semibold">Building/Number:</span>{" "}
                    {[selectedEvent.room.building, selectedEvent.room.room_number].filter(Boolean).join(" ") || "N/A"}
                  </div>
                  <div><span className="font-semibold">Timeslot ID:</span> {selectedEvent.timeslot.id}</div>
                  <div>
                    <span className="font-semibold">Day/Time:</span>{" "}
                    {(selectedEvent.timeslot.day || selectedEvent.timeslot.days || "").toString()}{" "}
                    {formatTimeAmPm(selectedEvent.timeslot.start_time)} - {formatTimeAmPm(selectedEvent.timeslot.end_time)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="hidden print:block print-calendar">
        {DAYS.map((day) => {
          const printRows = getRoomRowsForDay(day);
          return (
            <div key={`print-${day}`} className="print-page">
              <h2 className="text-xl font-bold mb-3">Schedule Output Calendar - {day}</h2>
              <div className="border border-slate-300">
                <div className="flex bg-slate-50 border-b border-slate-300">
                  <div className="w-40 flex-shrink-0 border-r border-slate-300 p-2 text-[10px] font-bold uppercase">
                    Rooms \ Time
                  </div>
                  <div className="flex flex-1">
                    {timeAxisLabels.map((t) => (
                      <div
                        key={`${day}-${t}`}
                        className="flex-1 text-center p-2 border-r border-slate-300 text-[10px] font-bold"
                      >
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
                {printRows.map(({ room, events, rowHeight }) => (
                  <div
                    key={`print-row-${day}-${room.id}`}
                    className="flex border-b border-slate-200 last:border-b-0"
                  >
                    <div className="w-40 flex-shrink-0 border-r border-slate-300 p-2 text-xs">
                      <div className="font-bold">
                        {[room.building, room.room_number].filter(Boolean).join(" ") || room.id}
                      </div>
                      <div className="text-[10px] text-slate-600">
                        Capacity: {room.capacity ?? "N/A"}
                      </div>
                    </div>
                    <div className="flex-1 relative" style={{ minHeight: rowHeight }}>
                      <div
                        className="absolute inset-0 grid pointer-events-none"
                        style={{ gridTemplateColumns: `repeat(${hourSegments}, minmax(0, 1fr))` }}
                      >
                        {Array.from({ length: hourSegments }).map((_, j) => (
                          <div
                            key={j}
                            className="border-r border-slate-300/50 last:border-r-0"
                          />
                        ))}
                      </div>
                      {events.map(({ section, start, end, lane }) => {
                        const leftPct =
                          ((clamp(start, axisStart, axisEnd) - axisStart) / axisRange) * 100;
                        const widthPct =
                          ((clamp(end, axisStart, axisEnd) -
                            clamp(start, axisStart, axisEnd)) /
                            axisRange) *
                          100;
                        const top = EVENT_TOP_PADDING_PX + lane * (EVENT_HEIGHT_PX + EVENT_GAP_PX);
                        const color = printColorForScheduleSection(section);
                        const professorName =
                          instructorById.get(section.instructor_id)?.name ??
                          section.instructor_id;
                        const professorLastName = professorName.trim().split(/\s+/).pop() ?? professorName;

                        return (
                          <div
                            key={`print-event-${day}-${section.id}`}
                            className="absolute border rounded px-2 py-1 text-[10px] leading-tight overflow-hidden"
                            style={{
                              left: `${leftPct}%`,
                              width: `${Math.max(widthPct, 0.5)}%`,
                              top,
                              height: EVENT_HEIGHT_PX,
                              backgroundColor: color.bg,
                              borderColor: "#94a3b8",
                              borderLeftWidth: 4,
                              borderLeftColor: color.border,
                            }}
                          >
                            <div className="font-bold truncate">{section.course_id}</div>
                            <div className="truncate">{professorLastName}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
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
        }
      `}</style>

    </div>
  );
}


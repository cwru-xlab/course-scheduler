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
  course_id: string;
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
  const raw = (timeslot.days ?? timeslot.day ?? "").toString();
  const normalized = raw.toLowerCase();
  const selectedLower = selected.toLowerCase();

  // Common cases: "Mon", "Tue", etc
  if (normalized.includes(selectedLower)) return true;

  // Compact cases: "MWF", "TR"
  const letter = DAY_LETTER[selected].toLowerCase();
  if (normalized.includes(letter)) return true;

  // If someone uses "th" for Thu
  if (selected === "Thu" && normalized.includes("th")) return true;

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

function courseColorForId(courseId: string) {
  let hash = 0;
  for (let i = 0; i < courseId.length; i += 1) {
    hash = (hash * 31 + courseId.charCodeAt(i)) >>> 0;
  }
  return COURSE_COLOR_CLASSES[hash % COURSE_COLOR_CLASSES.length];
}

export default function CalendarPage() {
  const [selectedDay, setSelectedDay] = useState<Day>("Mon");
  const [data, setData] = useState<SolverDataDto | null>(null);
  const [solverInput, setSolverInput] = useState<SchedulingInput | null>(null);
  const [assignmentsBySection, setAssignmentsBySection] = useState<
    Record<string, { timeslot_ids: string[]; room_id: string; meeting_pattern_id: string }>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [solverTimeslotIdsBySection, setSolverTimeslotIdsBySection] = useState<
    Record<string, string[]>
  >({});
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);
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
                  section_code: section.section_code,
                  instructor_id: section.instructor_id,
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
        if (mounted) setData(json.data);
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

  const updateLastRunStorage = (
    nextInput: SchedulingInput,
    assignments: Record<string, { timeslot_ids: string[]; room_id: string; meeting_pattern_id: string }>,
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

  const dayTimeslotBoundaries = useMemo(() => {
    if (!data) return [];
    const boundaries = new Set<number>();
    data.timeslots
      .filter((slot) => timeslotMatchesDay(slot, selectedDay))
      .forEach((slot) => {
        boundaries.add(parseMinutes(slot.start_time));
        boundaries.add(parseMinutes(slot.end_time));
      });
    return [...boundaries]
      .filter((m) => m >= axisStart && m <= axisEnd)
      .sort((a, b) => a - b);
  }, [data, selectedDay, axisStart, axisEnd]);

  const handleDropOnRoomRow = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!data || !solverInput || !draggedSectionId) return;

    const dragged = dayEvents.find((x) => x.section.id === draggedSectionId && x.timeslot);
    if (!dragged || !dragged.timeslot) return;
    const fixedRoomId = dragged.section.room_id;
    if (!fixedRoomId) return;

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
      setDragError(
        `Unable to place ${dragged.section.course_id}: no compatible ${selectedDay} timeslot found for this class duration.`,
      );
      return;
    }

    const currentAssignment = assignmentsBySection[draggedSectionId];
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
    const uniqueNextTimeslotIds = [...new Set(nextTimeslotIds)];

    const nextInput = JSON.parse(JSON.stringify(solverInput)) as SchedulingInput;
    const otherLocks = nextInput.locked_assignments.filter(
      (lock) => lock.section_id !== draggedSectionId,
    );
    nextInput.locked_assignments = [
      ...otherLocks,
      {
        section_id: draggedSectionId,
        fixed_room: fixedRoomId,
        fixed_timeslot_set: uniqueNextTimeslotIds,
      },
    ];

    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextInput),
      });
      const result = (await response.json()) as
        | (ScheduleSolution & { status: "ok" })
        | {
            status: "error";
            errors: { code: string; message: string }[];
            diagnostics?: {
              feasible_if_relax?: string[];
              feasible_if_remove_section?: string[];
            };
          };

      if (!response.ok || result.status === "error") {
        const errorMessage =
          result.status === "error"
            ? result.errors.map((e) => e.message).join(" ")
            : "Unknown validation error.";
        const conflictHint =
          result.status === "error" && result.diagnostics?.feasible_if_relax?.length
            ? ` Try relaxing: ${result.diagnostics.feasible_if_relax.join(", ")}.`
            : "";
        setDragError(
          `Invalid move for ${dragged.section.course_id} to ${formatTimeAmPm(selectedSlot.start_time)}-${formatTimeAmPm(selectedSlot.end_time)} in room ${fixedRoomId}. ${errorMessage}${conflictHint}`,
        );
        return;
      }

      const nextAssignments = Object.fromEntries(
        result.assignments.map((assignment) => [
          assignment.section_id,
          {
            timeslot_ids: assignment.timeslot_ids,
            room_id: assignment.room_id,
            meeting_pattern_id: assignment.meeting_pattern_id,
          },
        ]),
      );
      setAssignmentsBySection(nextAssignments);
      setSolverTimeslotIdsBySection(
        Object.fromEntries(
          result.assignments.map((assignment) => [
            assignment.section_id,
            assignment.timeslot_ids,
          ]),
        ),
      );
      setSolverInput(nextInput);
      updateLastRunStorage(nextInput, nextAssignments);
      setDragError(null);
    } catch (err) {
      setDragError(
        err instanceof Error
          ? err.message
          : "Drag validation failed because solver could not be reached.",
      );
    } finally {
      setDraggedSectionId(null);
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
        <div className="flex gap-3">
          <button className="flex items-center justify-center rounded-lg h-10 px-4 bg-slate-100 text-slate-900 font-bold gap-2 border border-slate-200">
            <Share2 className="size-4" />
            Export PDF
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

      {/* Main calendar grid */}
      <div
        className={clsx(
          "rounded-xl border shadow-lg overflow-hidden flex flex-col min-h-[600px]",
          dragError
            ? "bg-red-50/40 border-red-200"
            : "bg-white border-slate-200",
        )}
      >
        {dragError && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">
            {dragError}
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
          <div className="flex border-b border-slate-100 min-h-[240px]">
            <div className="w-40 flex-shrink-0 border-r border-slate-200 bg-slate-50/30">
              {roomRows.map(({ room, rowHeight }) => {
                const roomLabel = [room.building, room.room_number]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div
                    key={`label-${room.id}`}
                    className="border-b border-slate-100 last:border-b-0 px-3 py-3 flex flex-col justify-center"
                    style={{ minHeight: rowHeight }}
                  >
                    <span className="font-bold text-xs text-slate-900">
                      {roomLabel || room.id}
                    </span>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mt-1">
                      {room.id}
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
                  className="relative border-b border-slate-100 last:border-b-0"
                  style={{ minHeight: rowHeight }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => void handleDropOnRoomRow(e)}
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
                    const title = section.course_id;
                    const sub = section.id;
                    const timeLabel = `${formatTimeAmPm(timeslot?.start_time ?? "00:00")} - ${formatTimeAmPm(timeslot?.end_time ?? "00:00")}`;
                    const color = courseColorForId(title);

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
                        }}
                        onDragEnd={() => setDraggedSectionId(null)}
                        style={{
                          left: `${leftPct * 100}%`,
                          width: `${Math.max(widthPct * 100, 4)}%`,
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
                        title={`${title} • ${sub} • ${professor} • ${timeLabel} • Room ${room.id}`}
                      >
                        <div>
                          <div className="font-black text-[10px] truncate text-slate-900">
                            {title}
                          </div>
                          <div className="text-[9px] font-bold text-slate-500">
                            {sub}
                          </div>
                        </div>
                        <div className="text-[9px] font-bold leading-tight text-slate-700">
                          {professor}
                          <br />
                          {timeLabel}
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
            room(s) for <span className="font-bold">{selectedDay}</span>.
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
    </div>
  );
}


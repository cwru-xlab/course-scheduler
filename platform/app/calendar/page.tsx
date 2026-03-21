"use client";

import { useEffect, useMemo, useState } from "react";
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
};

type SectionDto = {
  id: string;
  course_id: string;
  section_code: string;
  instructor_id: string;
  timeslot_id?: string | null;
};

type SolverDataDto = {
  sections: SectionDto[];
  instructors: InstructorDto[];
  timeslots: TimeslotDto[];
};

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
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function CalendarPage() {
  const [selectedDay, setSelectedDay] = useState<Day>("Mon");
  const [data, setData] = useState<SolverDataDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
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

  const instructorById = useMemo(() => {
    const map = new Map<string, InstructorDto>();
    data?.instructors.forEach((i) => map.set(i.id, i));
    return map;
  }, [data]);

  const daySections = useMemo(() => {
    if (!data) return [];
    return data.sections
      .map((s) => {
        const ts = s.timeslot_id ? timeslotById.get(s.timeslot_id) : undefined;
        return { section: s, timeslot: ts };
      })
      .filter((x) => x.timeslot && timeslotMatchesDay(x.timeslot, selectedDay))
      .sort((a, b) => {
        const aMin = parseMinutes(a.timeslot?.start_time ?? "00:00");
        const bMin = parseMinutes(b.timeslot?.start_time ?? "00:00");
        return aMin - bMin;
      });
  }, [data, selectedDay, timeslotById]);

  // Calendar axis 8am - 9pm like the reference
  const axisStart = 8 * 60;
  const axisEnd = 21 * 60;
  const axisRange = axisEnd - axisStart;

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
          <button className="flex items-center justify-center rounded-lg h-10 px-4 bg-[#137fec] text-white font-bold gap-2 shadow-lg shadow-[#137fec]/20">
            <Rocket className="size-4" />
            Adjust Schedule Data
          </button>
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden flex flex-col min-h-[600px]">
        <div className="flex bg-slate-50 border-b border-slate-200">
          <div className="w-40 flex-shrink-0 border-r border-slate-200 p-4 font-bold text-[10px] uppercase text-slate-500 tracking-widest">
            Sections \ Time
          </div>
          <div className="flex flex-1">
            {[
              "8AM",
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
              "9PM",
            ].map((t) => (
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
            <div className="w-40 flex-shrink-0 border-r border-slate-200 bg-slate-50/30 p-4 flex flex-col justify-center">
              <span className="font-bold text-sm text-slate-900">
                {selectedDay} Sections
              </span>
              <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mt-1">
                {daySections.length} scheduled item(s)
              </span>
            </div>
            <div className="flex-1 relative">
              <div className="absolute inset-0 grid grid-cols-14 pointer-events-none">
                {Array.from({ length: 14 }).map((_, j) => (
                  <div
                    key={j}
                    className="border-r border-slate-100 last:border-r-0"
                  />
                ))}
              </div>

              {daySections.map(({ section, timeslot }, idx) => {
                const start = parseMinutes(timeslot?.start_time ?? "00:00");
                const end = parseMinutes(timeslot?.end_time ?? "00:00");
                const leftPct =
                  (clamp(start, axisStart, axisEnd) - axisStart) / axisRange;
                const widthPct =
                  (clamp(end, axisStart, axisEnd) -
                    clamp(start, axisStart, axisEnd)) /
                  axisRange;
                const top = 12 + (idx % 6) * 36; // simple vertical stacking

                const inst = instructorById.get(section.instructor_id);
                const professor = inst?.name ?? section.instructor_id ?? "—";
                const title = section.course_id;
                const sub = section.id;
                const timeLabel = `${timeslot?.start_time ?? ""} - ${timeslot?.end_time ?? ""}`;

                return (
                  <div
                    key={section.id}
                    className={clsx(
                      "absolute border-l-4 rounded-lg p-2.5 flex flex-col justify-between cursor-pointer transition-all z-10 shadow-sm hover:shadow-md",
                      "bg-[#137fec]/20 border-[#137fec]",
                    )}
                    style={{
                      left: `${leftPct * 100}%`,
                      width: `${Math.max(widthPct * 100, 4)}%`,
                      top,
                      height: 70,
                    }}
                    title={`${title} • ${sub} • ${professor} • ${timeLabel}`}
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

              {daySections.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm font-medium">
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
            Showing <span className="font-bold">{daySections.length}</span>{" "}
            scheduled section(s) for <span className="font-bold">{selectedDay}</span>.
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
    </div>
  );
}


import {
  SCHEDULING_WINDOW_END_TIME,
  SCHEDULING_WINDOW_START_TIME,
} from "@/lib/scheduling/timeWindow";

export const TIMESLOT_DAY_OPTIONS = [
  { key: "Mon", label: "Mon" },
  { key: "Tue", label: "Tue" },
  { key: "Wed", label: "Wed" },
  { key: "Thu", label: "Thu" },
  { key: "Fri", label: "Fri" },
  { key: "Sat", label: "Sat" },
  { key: "Sun", label: "Sun" },
];

export const TIMESLOT_BLOCK_TYPE_OPTIONS = [
  { key: "standard", label: "Short block" },
  { key: "evening", label: "Long block" },
];

const MIN_TIME = SCHEDULING_WINDOW_START_TIME;
const MAX_TIME = SCHEDULING_WINDOW_END_TIME;

export const toTimeOnly = (value: string | undefined): string => {
  if (!value) return MIN_TIME;
  if (value.includes("T")) {
    const timePart = value.split("T")[1] ?? MIN_TIME;
    return timePart.slice(0, 5);
  }
  return value.slice(0, 5);
};

export const fromTimeOnly = (value: string): string => value.slice(0, 5);

export const clampTimeToBounds = (hhmm: string): string => {
  if (!hhmm) return MIN_TIME;
  const toMinutes = (value: string) => {
    const [h, m] = value.split(":").map((x) => parseInt(x, 10));
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };
  const toHHMM = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };
  const min = toMinutes(MIN_TIME);
  const max = toMinutes(MAX_TIME);
  const val = toMinutes(hhmm);
  if (val < min) return MIN_TIME;
  if (val > max) return MAX_TIME;
  return toHHMM(val);
};

export const TIMESLOT_TIME_OPTIONS = (() => {
  const options: { key: string; label: string }[] = [];
  const minHour = Number.parseInt(MIN_TIME.split(":")[0] ?? "8", 10);
  const maxHour = Number.parseInt(MAX_TIME.split(":")[0] ?? "22", 10);
  for (let minutes = minHour * 60; minutes <= maxHour * 60; minutes += 5) {
    const h24 = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const hh = h24.toString().padStart(2, "0");
    const mm = mins.toString().padStart(2, "0");
    const suffix = h24 >= 12 ? "PM" : "AM";
    const h12 = ((h24 + 11) % 12) + 1;
    options.push({
      key: `${hh}:${mm}`,
      label: `${h12}:${mm} ${suffix}`,
    });
  }
  return options;
})();

export const splitTimeslotDays = (raw: string | string[] | undefined): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw
    .split(/[,/]/)
    .map((s) => s.trim())
    .filter(Boolean);
};

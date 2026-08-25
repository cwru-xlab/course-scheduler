/**
 * Canonical room numbers and calendar room sort helpers.
 * Short numbers without a leading zero get one prepended (2 → 02; 02 stays 02).
 */

export type CalendarRoomSortMode =
  | "buildingThenNumber"
  | "numberThenBuilding"
  | "capacityDesc"
  | "dataOrder";

export const CALENDAR_ROOM_SORT_STORAGE_KEY = "wsom-calendar-room-sort";

export const CALENDAR_ROOM_SORT_OPTIONS: Array<{
  value: CalendarRoomSortMode;
  label: string;
}> = [
  { value: "buildingThenNumber", label: "Building, then room #" },
  { value: "numberThenBuilding", label: "Room #, then building" },
  { value: "capacityDesc", label: "Capacity (high → low)" },
  { value: "dataOrder", label: "Data order" },
];

export const DEFAULT_CALENDAR_ROOM_SORT_MODE: CalendarRoomSortMode = "buildingThenNumber";

export function isCalendarRoomSortMode(value: unknown): value is CalendarRoomSortMode {
  return (
    value === "buildingThenNumber" ||
    value === "numberThenBuilding" ||
    value === "capacityDesc" ||
    value === "dataOrder"
  );
}

/**
 * If fewer than 3 digits and does not already begin with 0, prepend one zero.
 * Examples: 2 → 02, 12 → 012, 02 → 02, 102 → 102.
 * Also collapses prior 3-digit zfill of single-digit rooms (002 → 02).
 */
function padDigitRun(digits: string): string {
  if (!/^\d+$/.test(digits)) return digits;
  if (/^00\d$/.test(digits)) return digits.slice(1);
  if (digits.length >= 3 || digits.startsWith("0")) return digits;
  return `0${digits}`;
}

/**
 * Canonical room_number string.
 * Pure numeric → optional leading zero. Mixed (e.g. A2) → pad final numeric run only.
 */
export function canonicalizeRoomNumber(raw: unknown): string {
  const text = String(raw ?? "")
    .trim()
    .replace(/\.0+$/, "");
  if (!text) return "";

  if (/^\d+$/.test(text)) {
    return padDigitRun(text);
  }

  const match = text.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) return text;
  const [, prefix, digits, suffix] = match;
  return `${prefix}${padDigitRun(digits)}${suffix}`;
}

/** Natural compare for room numbers (digit runs compared numerically after canonicalize). */
export function compareRoomNumbers(a: unknown, b: unknown): number {
  const left = canonicalizeRoomNumber(a);
  const right = canonicalizeRoomNumber(b);
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export type RoomSortable = {
  id?: string;
  building?: string;
  room_number?: string;
  capacity?: number;
};

export function compareRooms(
  a: RoomSortable,
  b: RoomSortable,
  mode: CalendarRoomSortMode,
): number {
  if (mode === "dataOrder") return 0;

  const buildingA = String(a.building ?? "").trim();
  const buildingB = String(b.building ?? "").trim();
  const buildingCmp = buildingA.localeCompare(buildingB, undefined, {
    sensitivity: "base",
  });
  const numberCmp = compareRoomNumbers(a.room_number, b.room_number);
  const capacityA = Number(a.capacity ?? 0);
  const capacityB = Number(b.capacity ?? 0);

  if (mode === "buildingThenNumber") {
    return buildingCmp || numberCmp || String(a.id ?? "").localeCompare(String(b.id ?? ""));
  }
  if (mode === "numberThenBuilding") {
    return numberCmp || buildingCmp || String(a.id ?? "").localeCompare(String(b.id ?? ""));
  }
  // capacityDesc
  if (capacityB !== capacityA) return capacityB - capacityA;
  return buildingCmp || numberCmp || String(a.id ?? "").localeCompare(String(b.id ?? ""));
}

export function sortRooms<T extends RoomSortable>(
  rooms: T[],
  mode: CalendarRoomSortMode,
): T[] {
  if (mode === "dataOrder" || rooms.length < 2) return [...rooms];
  return [...rooms].sort((a, b) => compareRooms(a, b, mode));
}

export function readCalendarRoomSortMode(): CalendarRoomSortMode {
  if (typeof window === "undefined") return DEFAULT_CALENDAR_ROOM_SORT_MODE;
  try {
    const raw = window.localStorage.getItem(CALENDAR_ROOM_SORT_STORAGE_KEY);
    if (isCalendarRoomSortMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_CALENDAR_ROOM_SORT_MODE;
}

export function writeCalendarRoomSortMode(mode: CalendarRoomSortMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CALENDAR_ROOM_SORT_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

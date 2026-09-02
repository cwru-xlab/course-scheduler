import type { SemesterLength } from "./types";

export const DEFAULT_SEMESTER_LENGTH: SemesterLength = "full";

export const SEMESTER_LENGTH_OPTIONS: { key: SemesterLength; label: string }[] = [
  { key: "full", label: "Full" },
  { key: "half_any", label: "Half (any)" },
  { key: "first_half", label: "First Half" },
  { key: "second_half", label: "Second Half" },
];

const ALIASES: Record<string, SemesterLength> = {
  full: "full",
  "full semester": "full",
  "half any": "half_any",
  "half (any)": "half_any",
  half: "half_any",
  any: "half_any",
  "first half": "first_half",
  "1st half": "first_half",
  first: "first_half",
  h1: "first_half",
  "second half": "second_half",
  "2nd half": "second_half",
  second: "second_half",
  h2: "second_half",
};

const HALF_TERMS = new Set<SemesterLength>(["first_half", "second_half"]);

function canonicalKey(raw?: string | null): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function normalizeSemesterLength(raw?: string | null): SemesterLength {
  const value = canonicalKey(raw);
  if (!value) return DEFAULT_SEMESTER_LENGTH;
  return ALIASES[value] ?? DEFAULT_SEMESTER_LENGTH;
}

export function semesterLengthLabel(raw?: string | null): string {
  const key = normalizeSemesterLength(raw);
  return SEMESTER_LENGTH_OPTIONS.find((opt) => opt.key === key)?.label ?? "Full";
}

export function normalizeAssignedHalf(value: unknown): SemesterLength | null {
  if (value == null || !String(value).trim()) return null;
  const normalized = normalizeSemesterLength(String(value));
  if (normalized === "first_half" || normalized === "second_half") return normalized;
  return null;
}

export type TermConflictGroup = SemesterLength;

export type TermOccupant = {
  sectionId?: string;
  semesterLength: unknown;
  assignedHalf?: unknown;
};

export function effectiveTermGroup(
  semesterLength: unknown,
  assignedHalf?: unknown,
): TermConflictGroup {
  const normalized = normalizeSemesterLength(
    semesterLength == null ? null : String(semesterLength),
  );
  if (normalized !== "half_any") return normalized;
  if (assignedHalf != null && String(assignedHalf).trim()) {
    const resolved = normalizeSemesterLength(String(assignedHalf));
    if (resolved === "first_half" || resolved === "second_half") return resolved;
  }
  return "half_any";
}

/** Resolve half_any to the open half in a slot, or null when both halves are taken. */
export function resolveHalfAnyHalf(input: {
  semesterLength: unknown;
  assignedHalf?: unknown;
  occupiedHalves: Iterable<SemesterLength>;
}): "first_half" | "second_half" | null {
  const normalized = normalizeSemesterLength(
    input.semesterLength == null ? null : String(input.semesterLength),
  );
  if (normalized !== "half_any") return null;
  const explicit = normalizeAssignedHalf(input.assignedHalf);
  if (explicit) return explicit;
  const occupied = new Set(
    Array.from(input.occupiedHalves).filter((half): half is "first_half" | "second_half" =>
      HALF_TERMS.has(half),
    ),
  );
  if (!occupied.has("first_half")) return "first_half";
  if (!occupied.has("second_half")) return "second_half";
  return null;
}

/**
 * Deterministically resolve every half_any occupant in a room/slot.
 * Fixed half sections keep their term; half_any picks the next open half.
 */
export function resolveAllHalvesInSlot(
  occupants: TermOccupant[],
): Map<string, "first_half" | "second_half"> {
  const sorted = [...occupants].sort((a, b) =>
    String(a.sectionId ?? "").localeCompare(String(b.sectionId ?? "")),
  );
  const occupied = new Set<"first_half" | "second_half">();
  const resolved = new Map<string, "first_half" | "second_half">();

  for (const occupant of sorted) {
    const normalized = normalizeSemesterLength(String(occupant.semesterLength));
    if (normalized === "first_half" || normalized === "second_half") {
      if (occupant.sectionId) resolved.set(occupant.sectionId, normalized);
      occupied.add(normalized);
      continue;
    }
    if (normalized !== "half_any" || !occupant.sectionId) continue;
    const half = resolveHalfAnyHalf({
      semesterLength: occupant.semesterLength,
      assignedHalf: occupant.assignedHalf,
      occupiedHalves: occupied,
    });
    if (!half) continue;
    resolved.set(occupant.sectionId, half);
    occupied.add(half);
  }

  return resolved;
}

/** Occupant input for display: half_any ignores stored assigned_half so siblings resolve to H1/H2. */
export function occupantsForDisplayResolution(placement: {
  sectionId: string;
  semesterLength: unknown;
  assignedHalf?: unknown;
}): TermOccupant {
  const normalized = normalizeSemesterLength(String(placement.semesterLength));
  return {
    sectionId: placement.sectionId,
    semesterLength: placement.semesterLength,
    assignedHalf: normalized === "half_any" ? null : placement.assignedHalf,
  };
}

export type RoomSlotPlacement = {
  sectionId: string;
  roomId: string;
  startMin: number;
  endMin: number;
  semesterLength: unknown;
  assignedHalf?: unknown;
};

/**
 * Resolve display halves for all sections in a room/day, grouping by overlapping time
 * (not just identical timeslot ids). half_any siblings get complementary H1/H2 badges.
 */
export function resolveDisplayHalvesForRoomPlacements(
  placements: RoomSlotPlacement[],
): Map<string, "first_half" | "second_half"> {
  const resolvedBySection = new Map<string, "first_half" | "second_half">();
  const visited = new Set<string>();

  for (const placement of placements) {
    if (visited.has(placement.sectionId)) continue;
    const cluster = placements.filter(
      (other) =>
        other.roomId === placement.roomId &&
        other.startMin < placement.endMin &&
        other.endMin > placement.startMin,
    );
    const occupants = cluster.map(occupantsForDisplayResolution);
    for (const [sectionId, half] of resolveAllHalvesInSlot(occupants)) {
      resolvedBySection.set(sectionId, half);
      visited.add(sectionId);
    }
  }

  return resolvedBySection;
}

/** Badge/stack half for display: cooperative map wins; half_any ignores stored assigned_half. */
export function displayAssignedHalfForSection(
  sectionId: string,
  semesterLength: unknown,
  displayMap: Map<string, "first_half" | "second_half">,
  storedAssignedHalf?: unknown,
): "first_half" | "second_half" | null | undefined {
  const fromDisplay = displayMap.get(sectionId);
  if (fromDisplay) return fromDisplay;
  if (normalizeSemesterLength(String(semesterLength)) === "half_any") return undefined;
  return normalizeAssignedHalf(storedAssignedHalf) ?? undefined;
}

/** Collect resolved first/second halves already present in a slot. */
export function occupiedHalvesInSlot(occupants: TermOccupant[]): Set<"first_half" | "second_half"> {
  const halves = new Set<"first_half" | "second_half">();
  for (const occupant of occupants) {
    const group = effectiveTermGroup(occupant.semesterLength, occupant.assignedHalf);
    if (group === "first_half" || group === "second_half") {
      halves.add(group);
    }
  }
  for (const half of resolveAllHalvesInSlot(
    occupants.filter(
      (occupant) => normalizeSemesterLength(String(occupant.semesterLength)) === "half_any",
    ),
  ).values()) {
    halves.add(half);
  }
  return halves;
}

/** Like effectiveTermGroup but never returns half_any — uses slot context when needed. */
export function displayTermGroup(
  semesterLength: unknown,
  assignedHalf?: unknown,
  occupiedHalves?: Iterable<SemesterLength>,
): Exclude<TermConflictGroup, "half_any"> | null {
  const normalized = normalizeSemesterLength(
    semesterLength == null ? null : String(semesterLength),
  );
  if (normalized === "full") return "full";
  if (normalized === "first_half" || normalized === "second_half") return normalized;
  if (normalized === "half_any") {
    return resolveHalfAnyHalf({
      semesterLength,
      assignedHalf,
      occupiedHalves: occupiedHalves ?? [],
    });
  }
  return "full";
}

/** Return true when two sections cannot share the same weekly room/instructor slot. */
export function termsConflict(
  semesterLengthA: unknown,
  semesterLengthB: unknown,
  assignedHalfA?: unknown,
  assignedHalfB?: unknown,
): boolean {
  let groupA = effectiveTermGroup(semesterLengthA, assignedHalfA);
  let groupB = effectiveTermGroup(semesterLengthB, assignedHalfB);

  if (groupA === "half_any" && groupB === "half_any") {
    groupA = "first_half";
    groupB = "second_half";
  } else if (groupA === "half_any") {
    const occupied =
      groupB === "first_half" ? (["first_half"] as const) : groupB === "second_half" ? (["second_half"] as const) : [];
    const resolved = resolveHalfAnyHalf({
      semesterLength: semesterLengthA,
      assignedHalf: assignedHalfA,
      occupiedHalves: occupied,
    });
    if (!resolved) return true;
    groupA = resolved;
  } else if (groupB === "half_any") {
    const occupied =
      groupA === "first_half" ? (["first_half"] as const) : groupA === "second_half" ? (["second_half"] as const) : [];
    const resolved = resolveHalfAnyHalf({
      semesterLength: semesterLengthB,
      assignedHalf: assignedHalfB,
      occupiedHalves: occupied,
    });
    if (!resolved) return true;
    groupB = resolved;
  }

  if (groupA === "full" || groupB === "full") return true;
  return groupA === groupB;
}

/** Slot-aware term conflict check for placement (includes the moving section). */
export function slotHasTermConflict(occupants: TermOccupant[]): boolean {
  const resolved = resolveAllHalvesInSlot(occupants);
  let full = 0;
  let firstHalf = 0;
  let secondHalf = 0;

  for (const occupant of occupants) {
    const normalized = normalizeSemesterLength(String(occupant.semesterLength));
    if (normalized === "full") {
      full += 1;
      continue;
    }
    if (normalized === "first_half") {
      firstHalf += 1;
      continue;
    }
    if (normalized === "second_half") {
      secondHalf += 1;
      continue;
    }
    if (normalized === "half_any") {
      const half = occupant.sectionId ? resolved.get(occupant.sectionId) : null;
      if (!half) return true;
      if (half === "first_half") firstHalf += 1;
      else secondHalf += 1;
    }
  }

  if (full > 1) return true;
  if (firstHalf > 1) return true;
  if (secondHalf > 1) return true;
  if (full > 0 && (firstHalf > 0 || secondHalf > 0)) return true;
  return false;
}

export function termBadgeLabel(
  semesterLength: unknown,
  assignedHalf?: unknown,
  occupiedHalves?: Iterable<SemesterLength>,
): "H1" | "H2" | null {
  const group = displayTermGroup(semesterLength, assignedHalf, occupiedHalves);
  if (group === "first_half") return "H1";
  if (group === "second_half") return "H2";
  return null;
}

export function termStackRank(
  semesterLength: unknown,
  assignedHalf?: unknown,
  occupiedHalves?: Iterable<SemesterLength>,
): number {
  const group = displayTermGroup(semesterLength, assignedHalf, occupiedHalves);
  if (group === "first_half") return 0;
  if (group === "second_half") return 1;
  return 2;
}

export function termHoverLabel(
  semesterLength: unknown,
  assignedHalf?: unknown,
  occupiedHalves?: Iterable<SemesterLength>,
): string | null {
  const normalized = normalizeSemesterLength(
    semesterLength == null ? null : String(semesterLength),
  );
  if (normalized === "full") return null;
  if (normalized === "half_any") {
    const resolved = displayTermGroup(semesterLength, assignedHalf, occupiedHalves);
    if (resolved === "first_half") {
      const explicit = assignedHalf ? normalizeSemesterLength(String(assignedHalf)) : null;
      return explicit === "first_half"
        ? "Half — assigned to 1st half"
        : "Half — 1st half (auto)";
    }
    if (resolved === "second_half") {
      const explicit = assignedHalf ? normalizeSemesterLength(String(assignedHalf)) : null;
      return explicit === "second_half"
        ? "Half — assigned to 2nd half"
        : "Half — 2nd half (auto)";
    }
    return "Half (any)";
  }
  return SEMESTER_LENGTH_OPTIONS.find((opt) => opt.key === normalized)?.label ?? null;
}

/** Export-friendly duration label (never "Half (any)"). */
export function resolvedDurationLabel(
  semesterLength: unknown,
  assignedHalf?: unknown,
  occupiedHalves?: Iterable<SemesterLength>,
): string {
  const group = displayTermGroup(semesterLength, assignedHalf, occupiedHalves);
  if (group === "first_half") return "1st Half";
  if (group === "second_half") return "2nd Half";
  return "Full";
}

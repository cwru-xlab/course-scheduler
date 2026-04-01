/**
 * Human-readable labels for `penalty_breakdown` keys emitted by the Python solver
 * (`solver/app.py`). Unknown keys fall back to a title-cased snake_case name.
 */
export const PENALTY_DISPLAY_ORDER: string[] = [
  "room_waste",
  "instructor_day_preference",
  "instructor_pattern_preference",
  "section_preference_penalty",
  "soft_lock_time",
  "soft_lock_room",
  "adjunct_day_excess",
];

export type PenaltyLabelEntry = {
  title: string;
  description?: string;
};

export const PENALTY_KEY_LABELS: Record<string, PenaltyLabelEntry> = {
  room_waste: {
    title: "Room capacity waste",
    description:
      "Weighted penalty for unused seats in the assigned room (assigning a larger room than necessary).",
  },
  instructor_day_preference: {
    title: "Instructor preferred days",
    description:
      "Penalty when assigned meeting days do not overlap the instructor’s preferred days.",
  },
  instructor_pattern_preference: {
    title: "Instructor preferred meeting patterns",
    description:
      "Penalty when the assigned meeting pattern is not among the instructor’s preferred patterns.",
  },
  adjunct_day_excess: {
    title: "Adjunct teaching day limit",
    description:
      "Penalty for each teaching day beyond the adjunct maximum teaching days.",
  },
  soft_lock_time: {
    title: "Soft lock — time",
    description:
      "Penalty when the assignment does not match the section’s soft-locked preferred timeslots.",
  },
  soft_lock_room: {
    title: "Soft lock — room",
    description:
      "Penalty when the assignment is not in the soft-locked preferred room.",
  },
  section_preference_penalty: {
    title: "Section preferred time",
    description:
      "Penalty when the section’s preferred time slot is not included in the assignment.",
  },
};

/** One-line hint for the penalty color scale (green = 0, red = largest term this run). */
export const PENALTY_COLOR_LEGEND =
  "Values are tinted green when zero and shift toward red as they approach the largest single penalty in this breakdown (relative to this run, not an absolute scale).";

export function penaltyTitleForKey(key: string): string {
  const entry = PENALTY_KEY_LABELS[key];
  if (entry) return entry.title;
  return key
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function penaltyDescriptionForKey(key: string): string | undefined {
  return PENALTY_KEY_LABELS[key]?.description;
}

export function formatPenaltyValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }
  return String(value ?? "—");
}

/** Largest numeric penalty in the breakdown (for normalizing the green→red scale). */
export function maxNumericPenaltyInBreakdown(penalties: Record<string, unknown>): number {
  let max = 0;
  for (const v of Object.values(penalties)) {
    if (typeof v === "number" && Number.isFinite(v) && v > max) max = v;
  }
  return max;
}

/**
 * RGB text color: green at 0, red at `maxPositive`, linear in between.
 * Non-numeric or non-finite values use neutral slate.
 */
export function penaltyValueColor(value: unknown, maxPositive: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "rgb(71 85 105)"; // slate-600
  }
  if (value <= 0) {
    return "rgb(22 163 74)"; // green-600
  }
  const denom = maxPositive > 0 ? maxPositive : value;
  const t = Math.min(1, Math.max(0, value / denom));
  // green-600 → rose-600
  const r0 = 22;
  const g0 = 163;
  const b0 = 74;
  const r1 = 225;
  const g1 = 29;
  const b1 = 72;
  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const b = Math.round(b0 + (b1 - b0) * t);
  return `rgb(${r} ${g} ${b})`;
}

/** Stable ordering: known keys first, then any extra keys alphabetically. */
export function orderedPenaltyEntries(
  penalties: Record<string, unknown>,
): [string, unknown][] {
  const keys = Object.keys(penalties);
  return [...keys]
    .sort((a, b) => {
      const ia = PENALTY_DISPLAY_ORDER.indexOf(a);
      const ib = PENALTY_DISPLAY_ORDER.indexOf(b);
      const aKnown = ia !== -1;
      const bKnown = ib !== -1;
      if (aKnown && bKnown) return ia - ib;
      if (aKnown && !bKnown) return -1;
      if (!aKnown && bKnown) return 1;
      return a.localeCompare(b);
    })
    .map((k) => [k, penalties[k]]);
}

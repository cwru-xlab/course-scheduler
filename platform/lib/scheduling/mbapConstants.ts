/** Stable MBAP timeslot and meeting-pattern IDs (mirrored in solver/mbap_constants.py). */

export const MBAP_TAG = "mbap";
export const MBAP_HALF_1_TAG = "half-1";
export const MBAP_HALF_2_TAG = "half-2";

export const MBAP_TS_MON_615 = "Mon_1815_1945";
export const MBAP_TS_MON_800 = "Mon_2000_2130";
export const MBAP_TS_TUE_EVE = "Tue_1800_2100";
export const MBAP_TS_WED_EVE = "Wed_1800_2100";

export const MBAP_PATTERN_MON_615 = "mbap_mon_615";
export const MBAP_PATTERN_MON_800 = "mbap_mon_800";
export const MBAP_PATTERN_TUE_EVE = "mbap_tue_eve";
export const MBAP_PATTERN_WED_EVE = "mbap_wed_eve";

export const MBAP_ON_CAMPUS_PATTERNS = [MBAP_PATTERN_MON_615, MBAP_PATTERN_MON_800] as const;
export const MBAP_ONLINE_PATTERNS = [MBAP_PATTERN_TUE_EVE, MBAP_PATTERN_WED_EVE] as const;

export const MBAP_TIMESLOTS = [
  { id: MBAP_TS_MON_615, day: "Mon", start_time: "18:15", end_time: "19:45", slot_type: "evening" },
  { id: MBAP_TS_MON_800, day: "Mon", start_time: "20:00", end_time: "21:30", slot_type: "evening" },
  { id: MBAP_TS_TUE_EVE, day: "Tue", start_time: "18:00", end_time: "21:00", slot_type: "evening" },
  { id: MBAP_TS_WED_EVE, day: "Wed", start_time: "18:00", end_time: "21:00", slot_type: "evening" },
] as const;

export const MBAP_MEETING_PATTERNS = [
  {
    id: MBAP_PATTERN_MON_615,
    slots_required: 1,
    allowed_days: ["Mon"],
    compatible_timeslot_sets: [[MBAP_TS_MON_615]],
  },
  {
    id: MBAP_PATTERN_MON_800,
    slots_required: 1,
    allowed_days: ["Mon"],
    compatible_timeslot_sets: [[MBAP_TS_MON_800]],
  },
  {
    id: MBAP_PATTERN_TUE_EVE,
    slots_required: 1,
    allowed_days: ["Tue"],
    compatible_timeslot_sets: [[MBAP_TS_TUE_EVE]],
  },
  {
    id: MBAP_PATTERN_WED_EVE,
    slots_required: 1,
    allowed_days: ["Wed"],
    compatible_timeslot_sets: [[MBAP_TS_WED_EVE]],
  },
] as const;

export function isMbapCourse(subject: string, courseId: string): boolean {
  const subj = (subject || "").trim().toUpperCase();
  const cid = (courseId || "").trim().toUpperCase();
  return subj === "MBAP" || cid.startsWith("MBAP");
}

export function mbapAllowedPatterns(sectionNumber: string): string[] | null {
  const raw = (sectionNumber || "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const num = Number.parseInt(raw, 10);
  if (num === 400) return [...MBAP_ON_CAMPUS_PATTERNS];
  if (num >= 800 && num <= 899) return [...MBAP_ONLINE_PATTERNS];
  return null;
}

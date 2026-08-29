/** Mirrors solver PLACEHOLDER_INSTRUCTORS — no instructor double-book warnings for these. */
const PLACEHOLDER_IDS = new Set(["staff", "staff_tbd", "tbd", "tba"]);

export function isPlaceholderInstructor(
  instructorId?: string | null,
  instructorName?: string | null,
): boolean {
  const id = String(instructorId ?? "").trim().toLowerCase();
  if (id && PLACEHOLDER_IDS.has(id)) return true;
  if (id.startsWith("staff__")) return true;
  const name = String(instructorName ?? "").trim().toLowerCase();
  if (name === "staff" || name === "tbd" || name === "tba") return true;
  return false;
}

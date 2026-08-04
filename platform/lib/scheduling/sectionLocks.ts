import type { SectionLockState } from "./types";

/**
 * Normalize a raw input's hard/soft lock fields into the calendar's lock map.
 * Hard locks are applied first; a soft lock for the same section overrides it
 * (matches the shared-schedule normalization in the API routes).
 */
export function sectionLocksFromInput(input: {
  locked_assignments?: Array<{ section_id?: string }>;
  soft_locks?: Array<{ section_id?: string }>;
}): Record<string, SectionLockState> {
  const locks: Record<string, SectionLockState> = {};

  for (const la of Array.isArray(input.locked_assignments)
    ? input.locked_assignments
    : []) {
    const id = la?.section_id;
    if (typeof id === "string" && id) locks[id] = "hard";
  }

  for (const sl of Array.isArray(input.soft_locks) ? input.soft_locks : []) {
    const id = sl?.section_id;
    if (typeof id === "string" && id) locks[id] = "soft";
  }

  return locks;
}

export const SECTION_TERMS = ["full", "half_any", "first_half", "second_half"] as const;

export type SectionTerm = (typeof SECTION_TERMS)[number];

export const DEFAULT_SECTION_TERM: SectionTerm = "full";

export const SECTION_TERM_LABELS: Record<SectionTerm, string> = {
  full: "Full",
  half_any: "Half (any)",
  first_half: "1st half",
  second_half: "2nd half",
};

export const SECTION_TERM_OPTIONS = SECTION_TERMS.map((value) => ({
  key: value,
  label: SECTION_TERM_LABELS[value],
}));

const TERM_ALIASES: Record<string, SectionTerm> = {
  "": DEFAULT_SECTION_TERM,
  full: "full",
  full_semester: "full",
  half: "half_any",
  half_any: "half_any",
  any: "half_any",
  "1st_half": "first_half",
  first_half: "first_half",
  first: "first_half",
  h1: "first_half",
  "2nd_half": "second_half",
  second_half: "second_half",
  second: "second_half",
  h2: "second_half",
};

export function normalizeSectionTerm(value: unknown): SectionTerm {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");
  if (raw in TERM_ALIASES) return TERM_ALIASES[raw];
  if ((SECTION_TERMS as readonly string[]).includes(raw)) return raw as SectionTerm;
  return DEFAULT_SECTION_TERM;
}

export function normalizeAssignedHalf(value: unknown): SectionTerm | null {
  if (value == null || !String(value).trim()) return null;
  const normalized = normalizeSectionTerm(value);
  if (normalized === "first_half" || normalized === "second_half") return normalized;
  return null;
}

export type TermConflictGroup = SectionTerm | "half_any";

export function effectiveTermGroup(
  term: unknown,
  assignedHalf?: unknown,
): TermConflictGroup {
  const normalized = normalizeSectionTerm(term);
  if (normalized !== "half_any") return normalized;
  if (assignedHalf != null && String(assignedHalf).trim()) {
    const resolved = normalizeSectionTerm(assignedHalf);
    if (resolved === "first_half" || resolved === "second_half") return resolved;
  }
  return "half_any";
}

/** Return true when two sections cannot share the same weekly room/instructor slot. */
export function termsConflict(
  termA: unknown,
  termB: unknown,
  assignedHalfA?: unknown,
  assignedHalfB?: unknown,
): boolean {
  const groupA = effectiveTermGroup(termA, assignedHalfA);
  const groupB = effectiveTermGroup(termB, assignedHalfB);
  if (groupA === "half_any" || groupB === "half_any") return true;
  if (groupA === "full" || groupB === "full") return true;
  return groupA === groupB;
}

export type TermBadgeLabel = "H1" | "H2" | "half_any" | null;

export function termBadgeLabel(
  term: unknown,
  assignedHalf?: unknown,
): "H1" | "H2" | "half_any" | null {
  const group = effectiveTermGroup(term, assignedHalf);
  if (group === "first_half") return "H1";
  if (group === "second_half") return "H2";
  if (group === "half_any") return "half_any";
  return null;
}

export function termHoverLabel(term: unknown, assignedHalf?: unknown): string | null {
  const normalized = normalizeSectionTerm(term);
  if (normalized === "full") return null;
  if (normalized === "half_any") {
    const resolved = assignedHalf ? normalizeSectionTerm(assignedHalf) : null;
    if (resolved === "first_half") return "Half — assigned to 1st half";
    if (resolved === "second_half") return "Half — assigned to 2nd half";
    return "Half (any) — half not yet assigned";
  }
  return SECTION_TERM_LABELS[normalized];
}

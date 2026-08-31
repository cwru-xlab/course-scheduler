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
  "half any": "half_any",
  "half (any)": "half_any",
  half: "half_any",
  "first half": "first_half",
  "1st half": "first_half",
  "second half": "second_half",
  "2nd half": "second_half",
};

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

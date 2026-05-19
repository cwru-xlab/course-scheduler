import type { SectionState } from "./types";

export function normalizeSectionState(raw?: string | null): SectionState {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "archived" || value === "archive") {
    return "archived";
  }
  return "active";
}

export function isSectionArchived(section: { state?: string | null }): boolean {
  return normalizeSectionState(section.state) === "archived";
}

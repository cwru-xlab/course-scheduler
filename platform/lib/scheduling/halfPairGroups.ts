import { effectiveTermGroup } from "./sectionTerm";

export type PlacedHalfSection = {
  sectionId: string;
  roomId: string;
  timeslotKey: string;
  term: unknown;
  assignedHalf?: unknown;
};

/** Deterministic accent color for a complementary H1+H2 pair in the same slot. */
export function halfPairAccentColor(pairKey: string): string {
  let hash = 0;
  for (let i = 0; i < pairKey.length; i += 1) {
    hash = (hash * 31 + pairKey.charCodeAt(i)) | 0;
  }
  const hue = 250 + (Math.abs(hash) % 40);
  return `hsl(${hue} 55% 42%)`;
}

/**
 * Assign shared pair accents when first_half and second_half sections share a room+slot cell.
 * Returns sectionId -> accent color.
 */
export function computeHalfPairAccents(placed: PlacedHalfSection[]): Map<string, string> {
  const byCell = new Map<string, PlacedHalfSection[]>();
  for (const item of placed) {
    const group = effectiveTermGroup(item.term, item.assignedHalf);
    if (group !== "first_half" && group !== "second_half") continue;
    const cellKey = `${item.roomId}::${item.timeslotKey}`;
    const list = byCell.get(cellKey) ?? [];
    list.push(item);
    byCell.set(cellKey, list);
  }

  const accents = new Map<string, string>();
  for (const [cellKey, entries] of Array.from(byCell.entries())) {
    const hasH1 = entries.some((e: PlacedHalfSection) => effectiveTermGroup(e.term, e.assignedHalf) === "first_half");
    const hasH2 = entries.some((e: PlacedHalfSection) => effectiveTermGroup(e.term, e.assignedHalf) === "second_half");
    if (!hasH1 || !hasH2) continue;
    const pairKey = `${cellKey}::${entries
      .map((e: PlacedHalfSection) => e.sectionId)
      .sort()
      .join("|")}`;
    const color = halfPairAccentColor(pairKey);
    for (const entry of entries) {
      accents.set(entry.sectionId, color);
    }
  }
  return accents;
}

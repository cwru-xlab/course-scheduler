import {
  effectiveTermGroup,
  resolveDisplayHalvesForRoomPlacements,
  type RoomSlotPlacement,
} from "./semesterLength";

export type PlacedHalfSection = {
  sectionId: string;
  roomId: string;
  timeslotKey?: string;
  startMin: number;
  endMin: number;
  semesterLength: unknown;
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
  const placements: RoomSlotPlacement[] = placed.map((item) => ({
    sectionId: item.sectionId,
    roomId: item.roomId,
    startMin: item.startMin,
    endMin: item.endMin,
    semesterLength: item.semesterLength,
    assignedHalf: item.assignedHalf,
  }));
  const resolved = resolveDisplayHalvesForRoomPlacements(placements);
  const accents = new Map<string, string>();
  const visited = new Set<string>();

  for (const placement of placements) {
    if (visited.has(placement.sectionId)) continue;
    const cluster = placements.filter(
      (other) =>
        other.roomId === placement.roomId &&
        other.startMin < placement.endMin &&
        other.endMin > placement.startMin,
    );
    const hasH1 = cluster.some(
      (entry) => resolved.get(entry.sectionId ?? "") === "first_half",
    );
    const hasH2 = cluster.some(
      (entry) => resolved.get(entry.sectionId ?? "") === "second_half",
    );
    if (!hasH1 || !hasH2) {
      for (const entry of cluster) {
        if (entry.sectionId) visited.add(entry.sectionId);
      }
      continue;
    }
    const pairKey = `${placement.roomId}::${cluster
      .map((entry) => entry.sectionId)
      .filter(Boolean)
      .sort()
      .join("|")}`;
    const color = halfPairAccentColor(pairKey);
    for (const entry of cluster) {
      if (!entry.sectionId) continue;
      const group = effectiveTermGroup(entry.semesterLength, resolved.get(entry.sectionId));
      if (group === "first_half" || group === "second_half") {
        accents.set(entry.sectionId, color);
      }
      visited.add(entry.sectionId);
    }
  }

  return accents;
}

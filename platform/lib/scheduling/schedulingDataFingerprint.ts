import { normalizeCrosslistData } from "./crosslist";
import type { SchedulingInput } from "./types";

export type RecentChangeKind = "local" | "remote";

/** Stable serialized snapshot for equality checks. */
export function fingerprintSchedulingInput(data: SchedulingInput): string {
  return JSON.stringify(normalizeCrosslistData(data));
}

type RowExtractor = {
  scope: string;
  items: unknown[];
  rowKey: (item: unknown, index: number) => string;
  serialize: (item: unknown) => string;
};

function extractRows(data: SchedulingInput): RowExtractor[] {
  return [
    {
      scope: "sections",
      items: data.sections,
      rowKey: (item) => `sections:${(item as { id: string }).id}`,
      serialize: (item) => JSON.stringify(item),
    },
    {
      scope: "instructors",
      items: data.instructors,
      rowKey: (item) => `instructors:${(item as { id: string }).id}`,
      serialize: (item) => JSON.stringify(item),
    },
    {
      scope: "rooms",
      items: data.rooms,
      rowKey: (item) => `rooms:${(item as { id: string }).id}`,
      serialize: (item) => JSON.stringify(item),
    },
    {
      scope: "timeslots",
      items: data.timeslots,
      rowKey: (item) => `timeslots:${(item as { id: string }).id}`,
      serialize: (item) => JSON.stringify(item),
    },
    {
      scope: "meeting-patterns",
      items: data.meeting_patterns,
      rowKey: (item) => `meeting-patterns:${(item as { id: string }).id}`,
      serialize: (item) => JSON.stringify(item),
    },
    {
      scope: "constraints-crosslist-groups",
      items: data.crosslist_groups,
      rowKey: (item) => `constraints-crosslist-groups:${(item as { id: string }).id}`,
      serialize: (item) => JSON.stringify(item),
    },
    {
      scope: "constraints-no-overlap-groups",
      items: data.no_overlap_groups,
      rowKey: (item) =>
        `constraints-no-overlap-groups:${(item as { id: string }).id}`,
      serialize: (item) => JSON.stringify(item),
    },
    {
      scope: "constraints-blocked-times",
      items: data.blocked_times,
      rowKey: (_item, index) => `constraints-blocked-times:${index}`,
      serialize: (item) => JSON.stringify(item),
    },
    {
      scope: "constraints-locked-assignments",
      items: data.locked_assignments,
      rowKey: (item, index) => {
        const sectionId = (item as { section_id?: string }).section_id;
        return `constraints-locked-assignments:${sectionId || String(index)}`;
      },
      serialize: (item) => JSON.stringify(item),
    },
    {
      scope: "constraints-soft-locks",
      items: data.soft_locks,
      rowKey: (item, index) => {
        const sectionId = (item as { section_id?: string }).section_id;
        return `constraints-soft-locks:${sectionId || String(index)}`;
      },
      serialize: (item) => JSON.stringify(item),
    },
  ];
}

/** Row keys whose serialized content differs between two snapshots. */
export function diffSchedulingRowKeys(
  before: SchedulingInput | null,
  after: SchedulingInput,
): string[] {
  if (!before) return [];

  const changed: string[] = [];
  const beforeRows = extractRows(normalizeCrosslistData(before));
  const afterRows = extractRows(normalizeCrosslistData(after));

  for (let i = 0; i < beforeRows.length; i += 1) {
    const prev = beforeRows[i];
    const next = afterRows[i];
    const prevByKey = new Map(
      prev.items.map((item, index) => [prev.rowKey(item, index), prev.serialize(item)]),
    );
    const nextByKey = new Map(
      next.items.map((item, index) => [next.rowKey(item, index), next.serialize(item)]),
    );

    const keys = new Set([
      ...Array.from(prevByKey.keys()),
      ...Array.from(nextByKey.keys()),
    ]);
    for (const key of Array.from(keys)) {
      if (prevByKey.get(key) !== nextByKey.get(key)) {
        changed.push(key);
      }
    }
  }

  return changed;
}

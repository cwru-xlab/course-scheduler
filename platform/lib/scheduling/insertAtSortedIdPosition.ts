function idSortKey(id: string): number | string {
  if (/^\d+$/.test(id)) return parseInt(id, 10);
  const trailing = id.match(/(\d+)\s*$/);
  if (trailing?.[1]) return parseInt(trailing[1], 10);
  return id.toLowerCase();
}

function compareSortKeys(a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/** Insert a row so its ID order matches the rest of the table (numeric IDs when possible). */
export function insertAtSortedIdPosition<T extends { id: string }>(items: T[], item: T): T[] {
  const key = idSortKey(item.id);
  let insertAt = items.length;
  for (let i = 0; i < items.length; i += 1) {
    if (compareSortKeys(key, idSortKey(items[i].id)) < 0) {
      insertAt = i;
      break;
    }
  }
  const next = [...items];
  next.splice(insertAt, 0, item);
  return next;
}

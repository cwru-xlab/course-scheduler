export function nextIntegerId(existingIds: string[]): string {
  let max = 0;

  for (const raw of existingIds) {
    if (!raw) continue;
    // Prefer pure integer IDs
    if (/^\d+$/.test(raw)) {
      max = Math.max(max, parseInt(raw, 10));
      continue;
    }
    // Fallback: try trailing digits (e.g. SEC-12 -> 12)
    const m = raw.match(/(\d+)\s*$/);
    if (m?.[1]) {
      max = Math.max(max, parseInt(m[1], 10));
    }
  }

  return String(max + 1);
}


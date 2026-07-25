import type { AuthUser } from "@/lib/auth";

export type PresenceStatus = "active" | "idle";

export type PresenceUser = {
  networkId: string;
  name: string;
  status: PresenceStatus;
};

type PresenceRecord = {
  networkId: string;
  name: string;
  email: string;
  lastHeartbeatAt: number;
  lastActivityAt: number;
  tabVisible: boolean;
  /** Timestamp when tab became hidden (for grace period). */
  tabHiddenSince: number | null;
};

const globalRef = globalThis as unknown as {
  __presenceRecords?: Map<string, PresenceRecord>;
};

/** Drop sessions without a heartbeat longer than this. */
const PRESENCE_TTL_MS = 90_000;
/**
 * After the tab is hidden this long, the user is idle.
 * Short alt-tabs / focus flickers within this window stay "active".
 */
const TAB_HIDDEN_GRACE_MS = 15_000;

const getRecords = (): Map<string, PresenceRecord> => {
  if (!globalRef.__presenceRecords) {
    globalRef.__presenceRecords = new Map();
  }
  return globalRef.__presenceRecords;
};

/**
 * Active = tab is visible (user is looking at the app), including a short
 * grace after the tab is hidden so quick window switches don't flicker idle.
 * Idle = tab has been in the background longer than the grace period.
 *
 * We intentionally do NOT require mouse/keyboard activity: reading, watching
 * the solver progress bar, etc. should still count as active.
 */
function deriveStatus(record: PresenceRecord, now: number): PresenceStatus {
  if (record.tabVisible) return "active";

  if (
    record.tabHiddenSince !== null &&
    now - record.tabHiddenSince <= TAB_HIDDEN_GRACE_MS
  ) {
    return "active";
  }
  return "idle";
}

function pruneExpired(now: number) {
  const records = getRecords();
  for (const [key, record] of Array.from(records.entries())) {
    if (now - record.lastHeartbeatAt > PRESENCE_TTL_MS) {
      records.delete(key);
    }
  }
}

export function upsertPresence(
  user: AuthUser,
  payload: { lastActivityAt: number; tabVisible: boolean },
): void {
  const now = Date.now();
  pruneExpired(now);
  const records = getRecords();
  const existing = records.get(user.networkId);

  // Track when tab became hidden for grace period logic
  let tabHiddenSince: number | null = null;
  if (!payload.tabVisible) {
    // Preserve the original hidden timestamp across heartbeats while still hidden
    tabHiddenSince = existing?.tabHiddenSince ?? now;
  }

  records.set(user.networkId, {
    networkId: user.networkId,
    name: user.name,
    email: user.email,
    lastHeartbeatAt: now,
    lastActivityAt: payload.lastActivityAt,
    tabVisible: payload.tabVisible,
    tabHiddenSince,
  });
}

export function removePresence(networkId: string): void {
  getRecords().delete(networkId);
}

export function listPresenceUsers(): PresenceUser[] {
  const now = Date.now();
  pruneExpired(now);
  return Array.from(getRecords().values())
    .map((record) => ({
      networkId: record.networkId,
      name: record.name,
      status: deriveStatus(record, now),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

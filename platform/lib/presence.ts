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
};

const globalRef = globalThis as unknown as {
  __presenceRecords?: Map<string, PresenceRecord>;
};

/** Drop sessions without a heartbeat longer than this. */
const PRESENCE_TTL_MS = 90_000;
/** Recent interaction within this window counts as active (when tab is visible). */
const ACTIVE_WINDOW_MS = 60_000;

const getRecords = (): Map<string, PresenceRecord> => {
  if (!globalRef.__presenceRecords) {
    globalRef.__presenceRecords = new Map();
  }
  return globalRef.__presenceRecords;
};

function deriveStatus(record: PresenceRecord, now: number): PresenceStatus {
  if (!record.tabVisible) return "idle";
  if (now - record.lastActivityAt <= ACTIVE_WINDOW_MS) return "active";
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
  records.set(user.networkId, {
    networkId: user.networkId,
    name: user.name,
    email: user.email,
    lastHeartbeatAt: now,
    lastActivityAt: payload.lastActivityAt,
    tabVisible: payload.tabVisible,
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

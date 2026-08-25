import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { fetchSolver } from "@/lib/api/solverFetch";

export type ActivityKind =
  | "spreadsheet_import"
  | "editor_save"
  | "calendar_save"
  | "solver_run";

export type ActivityEvent = {
  id: string;
  networkId: string;
  actorName: string;
  kind: ActivityKind;
  message: string;
  createdAt: string;
};

const ACTIVITY_MESSAGES: Record<ActivityKind, (name: string) => string> = {
  spreadsheet_import: (name) => `${name} imported a spreadsheet`,
  editor_save: (name) => `${name} saved editor data`,
  calendar_save: (name) => `${name} saved calendar placements`,
  solver_run: (name) => `${name} ran the solver`,
};

const MAX_EVENTS = 30;
const TTL_MS = 24 * 60 * 60 * 1000;
const SYNC_TIMEOUT_MS = 8_000;

const globalRef = globalThis as unknown as {
  __activityEvents?: ActivityEvent[];
};

const DATA_DIR = join(process.cwd(), ".data");
const ACTIVITY_FILE = join(DATA_DIR, "activity-log.json");

function pruneExpired(events: ActivityEvent[], now: number): ActivityEvent[] {
  return events.filter((event) => {
    const created = Date.parse(event.createdAt);
    return Number.isFinite(created) && now - created <= TTL_MS;
  });
}

function loadFromDisk(): ActivityEvent[] {
  try {
    if (!existsSync(ACTIVITY_FILE)) return [];
    const raw = readFileSync(ACTIVITY_FILE, "utf8");
    const parsed = JSON.parse(raw) as ActivityEvent[];
    if (!Array.isArray(parsed)) return [];
    return pruneExpired(parsed, Date.now()).slice(0, MAX_EVENTS);
  } catch {
    return [];
  }
}

function getLocalEvents(): ActivityEvent[] {
  if (!globalRef.__activityEvents) {
    globalRef.__activityEvents = loadFromDisk();
  }
  return globalRef.__activityEvents;
}

function persistLocal(events: ActivityEvent[]) {
  globalRef.__activityEvents = events;
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(ACTIVITY_FILE, JSON.stringify(events, null, 2), "utf8");
  } catch {
    /* ignore on read-only filesystems */
  }
}

function normalizeEvent(raw: Record<string, unknown>): ActivityEvent | null {
  if (
    typeof raw.id !== "string" ||
    typeof raw.networkId !== "string" ||
    typeof raw.actorName !== "string" ||
    typeof raw.kind !== "string" ||
    typeof raw.message !== "string" ||
    typeof raw.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: raw.id,
    networkId: raw.networkId,
    actorName: raw.actorName,
    kind: raw.kind as ActivityKind,
    message: raw.message,
    createdAt: raw.createdAt,
  };
}

export async function recordActivity(input: {
  networkId: string;
  actorName: string;
  kind: ActivityKind;
}): Promise<ActivityEvent> {
  const actorName = input.actorName.trim() || "Someone";

  try {
    const { response, data } = await fetchSolver(
      "/sync/activity",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          networkId: input.networkId,
          actorName,
          kind: input.kind,
        }),
      },
      { timeoutMs: SYNC_TIMEOUT_MS },
    );
    if (response.ok && data.event && typeof data.event === "object") {
      const event = normalizeEvent(data.event as Record<string, unknown>);
      if (event) {
        const next = pruneExpired([event, ...getLocalEvents()], Date.now()).slice(
          0,
          MAX_EVENTS,
        );
        persistLocal(next);
        return event;
      }
    }
  } catch {
    /* fall through to local */
  }

  const event: ActivityEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    networkId: input.networkId,
    actorName,
    kind: input.kind,
    message: ACTIVITY_MESSAGES[input.kind](actorName),
    createdAt: new Date().toISOString(),
  };
  const now = Date.now();
  const next = pruneExpired([event, ...getLocalEvents()], now).slice(0, MAX_EVENTS);
  persistLocal(next);
  return event;
}

export async function listActivityEvents(limit = MAX_EVENTS): Promise<ActivityEvent[]> {
  try {
    const { response, data } = await fetchSolver(
      `/sync/activity?limit=${encodeURIComponent(String(limit))}`,
      { method: "GET", cache: "no-store" },
      { timeoutMs: SYNC_TIMEOUT_MS },
    );
    if (response.ok && Array.isArray(data.events)) {
      const events = (data.events as Array<Record<string, unknown>>)
        .map(normalizeEvent)
        .filter((e): e is ActivityEvent => e != null)
        .slice(0, limit);
      persistLocal(events);
      return events;
    }
  } catch {
    /* fall through to local */
  }

  const now = Date.now();
  const pruned = pruneExpired(getLocalEvents(), now);
  if (pruned.length !== getLocalEvents().length) {
    persistLocal(pruned);
  }
  return pruned.slice(0, limit);
}

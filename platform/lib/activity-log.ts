import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

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

function getEvents(): ActivityEvent[] {
  if (!globalRef.__activityEvents) {
    globalRef.__activityEvents = loadFromDisk();
  }
  return globalRef.__activityEvents;
}

function persistToDisk(events: ActivityEvent[]) {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(ACTIVITY_FILE, JSON.stringify(events, null, 2), "utf8");
  } catch {
    /* ignore on read-only filesystems */
  }
}

export function recordActivity(input: {
  networkId: string;
  actorName: string;
  kind: ActivityKind;
}): ActivityEvent {
  const actorName = input.actorName.trim() || "Someone";
  const event: ActivityEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    networkId: input.networkId,
    actorName,
    kind: input.kind,
    message: ACTIVITY_MESSAGES[input.kind](actorName),
    createdAt: new Date().toISOString(),
  };

  const now = Date.now();
  const next = pruneExpired([event, ...getEvents()], now).slice(0, MAX_EVENTS);
  globalRef.__activityEvents = next;
  persistToDisk(next);
  return event;
}

export function listActivityEvents(limit = MAX_EVENTS): ActivityEvent[] {
  const now = Date.now();
  const pruned = pruneExpired(getEvents(), now);
  if (pruned.length !== getEvents().length) {
    globalRef.__activityEvents = pruned;
    persistToDisk(pruned);
  }
  return pruned.slice(0, limit);
}

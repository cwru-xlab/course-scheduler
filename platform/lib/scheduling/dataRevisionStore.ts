import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import type { NextRequest } from "next/server";

import { fetchSolver } from "@/lib/api/solverFetch";
import { getRequestAuthUser } from "@/lib/record-activity";

import type { SchedulingDataRevision } from "./dataRevision";

export type { SchedulingDataRevision } from "./dataRevision";

const globalRef = globalThis as unknown as {
  __schedulingDataRevision?: SchedulingDataRevision | null;
};

const DATA_DIR = join(process.cwd(), ".data");
const REVISION_FILE = join(DATA_DIR, "scheduling-revision.json");
const SYNC_TIMEOUT_MS = 8_000;

function loadFromDisk(): SchedulingDataRevision | null {
  try {
    if (!existsSync(REVISION_FILE)) return null;
    const raw = readFileSync(REVISION_FILE, "utf8");
    const parsed = JSON.parse(raw) as SchedulingDataRevision;
    if (
      typeof parsed?.lastModifiedByNetworkId !== "string" ||
      typeof parsed?.lastModifiedByName !== "string" ||
      typeof parsed?.lastModifiedAt !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function getLocalRevision(): SchedulingDataRevision | null {
  if (globalRef.__schedulingDataRevision === undefined) {
    globalRef.__schedulingDataRevision = loadFromDisk();
  }
  return globalRef.__schedulingDataRevision;
}

function persistLocal(revision: SchedulingDataRevision) {
  globalRef.__schedulingDataRevision = revision;
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(REVISION_FILE, JSON.stringify(revision, null, 2), "utf8");
  } catch {
    /* ignore on read-only filesystems */
  }
}

function parseRevision(raw: unknown): SchedulingDataRevision | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as SchedulingDataRevision;
  if (
    typeof parsed.lastModifiedByNetworkId !== "string" ||
    typeof parsed.lastModifiedByName !== "string" ||
    typeof parsed.lastModifiedAt !== "string"
  ) {
    return null;
  }
  return parsed;
}

export async function recordSchedulingDataRevision(input: {
  networkId: string;
  actorName: string;
}): Promise<SchedulingDataRevision> {
  try {
    const { response, data } = await fetchSolver(
      "/sync/data-revision",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          networkId: input.networkId,
          actorName: input.actorName.trim() || "Someone",
        }),
      },
      { timeoutMs: SYNC_TIMEOUT_MS },
    );
    if (response.ok) {
      const revision = parseRevision(data.revision);
      if (revision) {
        persistLocal(revision);
        return revision;
      }
    }
  } catch {
    /* fall through to local */
  }

  const revision: SchedulingDataRevision = {
    lastModifiedByNetworkId: input.networkId,
    lastModifiedByName: input.actorName.trim() || "Someone",
    lastModifiedAt: new Date().toISOString(),
  };
  persistLocal(revision);
  return revision;
}

export async function getSchedulingDataRevision(): Promise<SchedulingDataRevision | null> {
  try {
    const { response, data } = await fetchSolver(
      "/sync/data-revision",
      { method: "GET", cache: "no-store" },
      { timeoutMs: SYNC_TIMEOUT_MS },
    );
    if (response.ok) {
      const revision = parseRevision(data.revision);
      if (revision) {
        persistLocal(revision);
        return revision;
      }
      if (data.revision == null) return null;
    }
  } catch {
    /* fall through to local */
  }
  return getLocalRevision();
}

/** Record who last wrote scheduling data to the solver (for cross-user refresh prompts). */
export async function tryRecordSchedulingDataRevision(
  request: NextRequest,
): Promise<SchedulingDataRevision | null> {
  const user = await getRequestAuthUser(request);
  if (!user) return null;
  return recordSchedulingDataRevision({
    networkId: user.networkId,
    actorName: user.name,
  });
}

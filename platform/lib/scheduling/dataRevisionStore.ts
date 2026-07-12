import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import type { NextRequest } from "next/server";

import { getRequestAuthUser } from "@/lib/record-activity";

import type { SchedulingDataRevision } from "./dataRevision";

export type { SchedulingDataRevision } from "./dataRevision";

const globalRef = globalThis as unknown as {
  __schedulingDataRevision?: SchedulingDataRevision | null;
};

const DATA_DIR = join(process.cwd(), ".data");
const REVISION_FILE = join(DATA_DIR, "scheduling-revision.json");

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

function getRevision(): SchedulingDataRevision | null {
  if (globalRef.__schedulingDataRevision === undefined) {
    globalRef.__schedulingDataRevision = loadFromDisk();
  }
  return globalRef.__schedulingDataRevision;
}

function persistToDisk(revision: SchedulingDataRevision) {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(REVISION_FILE, JSON.stringify(revision, null, 2), "utf8");
  } catch {
    /* ignore on read-only filesystems */
  }
}

export function recordSchedulingDataRevision(input: {
  networkId: string;
  actorName: string;
}): SchedulingDataRevision {
  const revision: SchedulingDataRevision = {
    lastModifiedByNetworkId: input.networkId,
    lastModifiedByName: input.actorName.trim() || "Someone",
    lastModifiedAt: new Date().toISOString(),
  };
  globalRef.__schedulingDataRevision = revision;
  persistToDisk(revision);
  return revision;
}

export function getSchedulingDataRevision(): SchedulingDataRevision | null {
  return getRevision();
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

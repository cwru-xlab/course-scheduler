import { NextRequest, NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import { verifyToken } from "@/lib/auth";
import { getSchedulingDataRevision } from "@/lib/scheduling/dataRevisionStore";
import { sectionLocksFromInput } from "@/lib/scheduling/sectionLocks";
import {
  publishSharedSchedule,
  readSharedSchedule,
  readSharedScheduleMeta,
  type SharedScheduleSnapshot,
} from "@/lib/shared-schedule";
import type { SectionLockState } from "@/lib/scheduling/types";

// GET /api/shared-schedule           -> cheap metadata (revision/ranBy/ranAt/dataRevision) for polling
// GET /api/shared-schedule?full=1    -> full snapshot payload for applying the schedule
// POST /api/shared-schedule          -> publish the caller's current view as the active schedule
export async function GET(request: NextRequest) {
  const full = request.nextUrl.searchParams.get("full");
  if (full) {
    return NextResponse.json(await readSharedSchedule(), {
      headers: { "Cache-Control": "no-store" },
    });
  }
  const meta = await readSharedScheduleMeta();
  const dataRevision =
    meta.dataRevision !== undefined
      ? meta.dataRevision
      : await getSchedulingDataRevision();
  return NextResponse.json(
    {
      revision: meta.revision,
      ranBy: meta.ranBy,
      ranAt: meta.ranAt,
      dataRevision,
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: NextRequest) {
  let userLabel: string | null = null;
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    if (token) {
      const user = await verifyToken(token);
      userLabel = user?.name ?? user?.email ?? null;
    }
  } catch {
    // best-effort attribution; the publish itself is still allowed
  }

  let body: {
    input?: unknown;
    solution?: unknown;
    sectionLocks?: Record<string, SectionLockState>;
    createdAt?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", errors: [{ code: "invalid_json", message: "Invalid JSON body." }] },
      { status: 400 },
    );
  }

  const input = body?.input as
    | {
        locked_assignments?: Array<{ section_id?: string }>;
        soft_locks?: Array<{ section_id?: string }>;
      }
    | undefined;
  const solution = body?.solution as { assignments?: unknown } | undefined;
  if (
    !input ||
    !solution ||
    typeof solution !== "object" ||
    !Array.isArray(solution.assignments) ||
    !Array.isArray((input as { sections?: unknown }).sections)
  ) {
    return NextResponse.json(
      {
        status: "error",
        errors: [
          {
            code: "invalid_snapshot",
            message:
              "Snapshot requires input.sections and solution.assignments arrays.",
          },
        ],
      },
      { status: 400 },
    );
  }

  const lockedSectionIds = Array.isArray(input.locked_assignments)
    ? Array.from(
        new Set(
          input.locked_assignments
            .map((la) => la?.section_id)
            .filter((id): id is string => typeof id === "string"),
        ),
      )
    : [];

  let sectionLocks: Record<string, SectionLockState> | undefined = body.sectionLocks;
  if (!sectionLocks) {
    sectionLocks = sectionLocksFromInput(input);
  }

  const snapshot: SharedScheduleSnapshot = {
    input: body.input as SharedScheduleSnapshot["input"],
    solution,
    lockedSectionIds,
    sectionLocks,
    createdAt: body.createdAt ?? new Date().toISOString(),
  };

  const meta = await publishSharedSchedule({ ranBy: userLabel, snapshot });
  return NextResponse.json(meta, { headers: { "Cache-Control": "no-store" } });
}

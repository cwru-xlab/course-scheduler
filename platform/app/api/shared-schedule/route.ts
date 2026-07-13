import { NextRequest, NextResponse } from "next/server";

import { readSharedSchedule, readSharedScheduleMeta } from "@/lib/shared-schedule";

// GET /api/shared-schedule           -> cheap metadata (revision/ranBy/ranAt) for polling
// GET /api/shared-schedule?full=1    -> full snapshot payload for applying the schedule
export async function GET(request: NextRequest) {
  const full = request.nextUrl.searchParams.get("full");
  if (full) {
    return NextResponse.json(readSharedSchedule(), {
      headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json(readSharedScheduleMeta(), {
    headers: { "Cache-Control": "no-store" },
  });
}

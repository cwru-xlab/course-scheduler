import { NextRequest, NextResponse } from "next/server";

import { listActivityEvents } from "@/lib/activity-log";
import { getRequestAuthUser } from "@/lib/record-activity";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getRequestAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    { events: listActivityEvents() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

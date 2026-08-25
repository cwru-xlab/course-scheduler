import { NextRequest, NextResponse } from "next/server";

import { checkAccessAllowlist, shouldBypassAllowlist } from "@/lib/access-allowlist";
import { siteConfig } from "@/config/site";
import { verifyToken } from "@/lib/auth";
import {
  listSavedSchedules,
  saveSavedSchedule,
} from "@/lib/scheduling/savedSchedulesStore";

export const runtime = "nodejs";

async function requireActiveUser(request: NextRequest) {
  const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
  if (!token) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const user = await verifyToken(token);
  if (!user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  if (shouldBypassAllowlist(user.authProvider)) {
    return { user, tier: "active" as const };
  }

  // Prefer cache so a brief solver timeout during /solve does not cascade 403s.
  const access = await checkAccessAllowlist(user.networkId);
  if (!access.allowed || (access.tier !== "active" && access.tier !== "developer")) {
    return {
      error: NextResponse.json(
        {
          error: "forbidden",
          message: "Only active or developer users can access saved schedules.",
        },
        { status: 403 },
      ),
    };
  }
  return { user, tier: access.tier };
}

export async function GET(request: NextRequest) {
  const gate = await requireActiveUser(request);
  if ("error" in gate && gate.error) return gate.error;

  const entries = listSavedSchedules();
  return NextResponse.json({ status: "ok", entries }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const gate = await requireActiveUser(request);
  if ("error" in gate && gate.error) return gate.error;

  let body: { name?: string; scheduleDate?: string; snapshot?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { status: "error", errors: [{ code: "invalid_json", message: "Invalid JSON body." }] },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { status: "error", errors: [{ code: "invalid_name", message: "Schedule name is required." }] },
      { status: 400 },
    );
  }

  const scheduleDate = typeof body.scheduleDate === "string" ? body.scheduleDate.trim() : "";
  if (!scheduleDate) {
    return NextResponse.json(
      { status: "error", errors: [{ code: "invalid_date", message: "Schedule date is required." }] },
      { status: 400 },
    );
  }

  if (!body.snapshot || typeof body.snapshot !== "object") {
    return NextResponse.json(
      { status: "error", errors: [{ code: "invalid_snapshot", message: "Snapshot is required." }] },
      { status: 400 },
    );
  }

  const entry = saveSavedSchedule({
    name,
    scheduleDate,
    savedByUserId: gate.user!.networkId,
    savedByName: gate.user!.name || gate.user!.email || "Unknown",
    snapshot: body.snapshot as any,
  });

  return NextResponse.json({ status: "ok", entry }, { status: 201 });
}

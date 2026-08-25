import { NextRequest, NextResponse } from "next/server";

import { checkAccessAllowlist, shouldBypassAllowlist } from "@/lib/access-allowlist";
import { siteConfig } from "@/config/site";
import { verifyToken } from "@/lib/auth";
import {
  renameSavedSchedule,
  deleteSavedSchedule,
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
          message: "Only active or developer users can manage saved schedules.",
        },
        { status: 403 },
      ),
    };
  }
  return { user, tier: access.tier };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireActiveUser(request);
  if ("error" in gate && gate.error) return gate.error;

  const { id } = await params;
  let body: { name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { status: "error", errors: [{ code: "invalid_json", message: "Invalid JSON body." }] },
      { status: 400 },
    );
  }

  const newName = typeof body.name === "string" ? body.name.trim() : "";
  if (!newName) {
    return NextResponse.json(
      { status: "error", errors: [{ code: "invalid_name", message: "Name cannot be blank." }] },
      { status: 400 },
    );
  }

  const renamed = renameSavedSchedule(id, newName);
  if (!renamed) {
    return NextResponse.json(
      { status: "error", errors: [{ code: "not_found", message: "Schedule not found." }] },
      { status: 404 },
    );
  }

  return NextResponse.json({ status: "ok", entry: renamed });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireActiveUser(request);
  if ("error" in gate && gate.error) return gate.error;

  const { id } = await params;
  const deleted = deleteSavedSchedule(id);
  if (!deleted) {
    return NextResponse.json(
      { status: "error", errors: [{ code: "not_found", message: "Schedule not found." }] },
      { status: 404 },
    );
  }

  return NextResponse.json({ status: "ok", deleted: id });
}

import { NextRequest, NextResponse } from "next/server";

import { verifyToken } from "@/lib/auth";
import { listPresenceUsers, removePresence, upsertPresence } from "@/lib/presence";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";

async function getAuthUser(request: NextRequest) {
  const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { users: listPresenceUsers() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    lastActivityAt?: number;
    tabVisible?: boolean;
    leaving?: boolean;
  };

  if (body.leaving) {
    removePresence(user.networkId);
    return NextResponse.json({ ok: true });
  }

  const lastActivityAt =
    typeof body.lastActivityAt === "number" && Number.isFinite(body.lastActivityAt)
      ? body.lastActivityAt
      : Date.now();
  const tabVisible = body.tabVisible !== false;

  upsertPresence(user, { lastActivityAt, tabVisible });
  return NextResponse.json({ ok: true, users: listPresenceUsers() });
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  removePresence(user.networkId);
  return NextResponse.json({ ok: true });
}

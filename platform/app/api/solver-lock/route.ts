import { NextRequest, NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import { verifyToken, type AuthUser } from "@/lib/auth";
import {
  cancelSolverSession,
  readSolverSession,
  toLockCompat,
} from "@/lib/solver-session";

async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    if (!token) return null;
    return await verifyToken(token);
  } catch {
    return null;
  }
}

/** Snapshot (compat shape) for debugging / non-SSE clients. */
export async function GET() {
  return NextResponse.json(toLockCompat(readSolverSession()), {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Cancel the current solver run (only by the user who started it). */
export async function DELETE(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ok = cancelSolverSession(user.networkId);
  if (!ok) {
    const state = readSolverSession();
    if (!state.locked) {
      return NextResponse.json({ ok: true, cancelled: false }, { status: 200 });
    }
    return NextResponse.json(
      { error: "Cannot cancel: not the owner of this run" },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true, cancelled: true }, { status: 200 });
}

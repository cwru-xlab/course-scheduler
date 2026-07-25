import { NextRequest, NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import { verifyToken, type AuthUser } from "@/lib/auth";
import {
  cancelSolverRun,
  readSolverLock,
  releaseSolverLock,
  updateSolverProgress,
} from "@/lib/solver-lock";

async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  try {
    const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
    if (!token) return null;
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function GET() {
  return NextResponse.json(readSolverLock(), {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Update solver progress (called by the running client). */
export async function PATCH(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { progress?: number };
  if (typeof body.progress === "number") {
    updateSolverProgress(body.progress);
  }

  return NextResponse.json(readSolverLock(), {
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

  const lock = readSolverLock();
  // Only the user who started the run can cancel it
  if (lock.active && lock.startedByNetworkId === user.networkId) {
    cancelSolverRun();
    // Release the lock after a short delay to allow the solver to see the cancellation
    setTimeout(() => {
      releaseSolverLock();
    }, 2000);
    return NextResponse.json({ ok: true, cancelled: true }, { status: 200 });
  }

  return NextResponse.json(
    { error: "Cannot cancel: not the owner of this run" },
    { status: 403 },
  );
}

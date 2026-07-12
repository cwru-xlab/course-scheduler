import { NextRequest, NextResponse } from "next/server";

import { verifyToken } from "@/lib/auth";
import type { UserSyncPreferences } from "@/lib/scheduling/syncPreferences";
import { DEFAULT_USER_SYNC_PREFERENCES } from "@/lib/scheduling/syncPreferences";
import {
  readUserSyncPreferencesForUser,
  writeUserSyncPreferencesForUser,
} from "@/lib/user-sync-preferences-store";
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

  const preferences = readUserSyncPreferencesForUser(user.networkId);
  return NextResponse.json(
    { preferences, hasSavedPreferences: preferences !== null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<UserSyncPreferences>;
  const existing =
    readUserSyncPreferencesForUser(user.networkId) ?? DEFAULT_USER_SYNC_PREFERENCES;
  const preferences = writeUserSyncPreferencesForUser(user.networkId, {
    autoSaveEnabled:
      typeof body.autoSaveEnabled === "boolean"
        ? body.autoSaveEnabled
        : existing.autoSaveEnabled,
    autoRefreshEnabled:
      typeof body.autoRefreshEnabled === "boolean"
        ? body.autoRefreshEnabled
        : existing.autoRefreshEnabled,
  });

  return NextResponse.json({ preferences });
}

import type { NextRequest } from "next/server";

import { verifyToken } from "@/lib/auth";
import { recordActivity, type ActivityKind } from "@/lib/activity-log";
import { siteConfig } from "@/config/site";

export async function getRequestAuthUser(request: NextRequest) {
  const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function tryRecordActivity(
  request: NextRequest,
  kind: ActivityKind,
): Promise<void> {
  const user = await getRequestAuthUser(request);
  if (!user) return;
  await recordActivity({
    networkId: user.networkId,
    actorName: user.name,
    kind,
  });
}

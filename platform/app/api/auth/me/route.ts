import { NextRequest, NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import {
  checkAccessAllowlist,
  shouldBypassAllowlist,
} from "@/lib/access-allowlist";
import { verifyToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const user = await verifyToken(token);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (shouldBypassAllowlist(user.authProvider)) {
    return NextResponse.json({
      user: { ...user, accessTier: user.accessTier ?? "active" },
    });
  }

  const access = await checkAccessAllowlist(user.networkId);
  if (!access.allowed) {
    return NextResponse.json({ error: "access_denied" }, { status: 403 });
  }

  return NextResponse.json({
    user: { ...user, accessTier: access.tier },
  });
}

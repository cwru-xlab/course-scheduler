import { NextRequest, NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
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
  return NextResponse.json({ user });
}

import { NextResponse } from "next/server";

import { siteConfig } from "@/config/site";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(siteConfig.auth.cookie.name, "", {
    httpOnly: siteConfig.auth.cookie.httpOnly,
    secure: siteConfig.auth.cookie.secure,
    sameSite: siteConfig.auth.cookie.sameSite,
    path: siteConfig.auth.cookie.path,
    maxAge: 0,
  });
  return response;
}

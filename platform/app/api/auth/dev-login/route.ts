import { NextRequest, NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import { signToken, type AuthUser } from "@/lib/auth";

export const runtime = "nodejs";

function isLocalhostHost(host: string | null): boolean {
  if (!host) return false;
  const hostname = host.split(":")[0].toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function devLoginAllowed(request: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const host = request.headers.get("host");
  return isLocalhostHost(host);
}

export async function POST(request: NextRequest) {
  if (!devLoginAllowed(request)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const user: AuthUser = {
    email: "dev@case.edu",
    name: "Dev User",
    networkId: "dev001",
    authProvider: "dev",
  };

  try {
    const token = await signToken(user);
    const response = NextResponse.json({ success: true, user });
    response.cookies.set(siteConfig.auth.cookie.name, token, {
      httpOnly: siteConfig.auth.cookie.httpOnly,
      secure: siteConfig.auth.cookie.secure,
      sameSite: siteConfig.auth.cookie.sameSite,
      path: siteConfig.auth.cookie.path,
      maxAge: siteConfig.auth.cookieMaxAge,
    });
    return response;
  } catch (e) {
    console.error("Dev login failed:", e);
    return NextResponse.json(
      { success: false, error: "dev_login_failed" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

import { siteConfig } from "@/config/site";
import {
  buildAuthUserFromCAS,
  getCallbackUrl,
  signToken,
  validateCWRUTicket,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticket = searchParams.get("ticket");

  if (!ticket) {
    return NextResponse.redirect(
      new URL("/login?error=missing_ticket", request.url),
    );
  }

  let serviceUrl: string;
  try {
    serviceUrl = getCallbackUrl();
  } catch (e) {
    console.error("Failed to resolve callback URL:", e);
    return NextResponse.redirect(
      new URL("/login?error=server_misconfigured", request.url),
    );
  }

  try {
    const result = await validateCWRUTicket(ticket, serviceUrl);
    if (!result.success || !result.userInfo) {
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent(result.error ?? "sso_validation_failed")}`,
          request.url,
        ),
      );
    }

    const user = buildAuthUserFromCAS(result.userInfo);
    const token = await signToken(user);

    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set(siteConfig.auth.cookie.name, token, {
      httpOnly: siteConfig.auth.cookie.httpOnly,
      secure: siteConfig.auth.cookie.secure,
      sameSite: siteConfig.auth.cookie.sameSite,
      path: siteConfig.auth.cookie.path,
      maxAge: siteConfig.auth.cookieMaxAge,
    });
    return response;
  } catch (e) {
    console.error("CWRU SSO callback error:", e);
    return NextResponse.redirect(
      new URL("/login?error=sso_error", request.url),
    );
  }
}

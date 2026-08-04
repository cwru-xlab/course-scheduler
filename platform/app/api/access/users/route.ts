import { NextRequest, NextResponse } from "next/server";

import {
  addActiveAccessUser,
  checkAccessAllowlist,
  listActiveAccessUsers,
  removeActiveAccessUser,
  shouldBypassAllowlist,
} from "@/lib/access-allowlist";
import { siteConfig } from "@/config/site";
import { verifyToken } from "@/lib/auth";

export const runtime = "nodejs";

async function requireActiveUser(request: NextRequest) {
  const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
  if (!token) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const user = await verifyToken(token);
  if (!user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  if (shouldBypassAllowlist(user.authProvider)) {
    // Local dev sessions can manage the active list for testing.
    return { user, tier: "active" as const };
  }

  const access = await checkAccessAllowlist(user.networkId, { skipCache: true });
  if (!access.allowed || access.tier !== "active") {
    return {
      error: NextResponse.json(
        { error: "forbidden", message: "Only active users can manage access." },
        { status: 403 },
      ),
    };
  }
  return { user, tier: access.tier };
}

export async function GET(request: NextRequest) {
  const gate = await requireActiveUser(request);
  if ("error" in gate && gate.error) return gate.error;

  const listed = await listActiveAccessUsers();
  if (!listed.ok) {
    return NextResponse.json(
      { status: "error", errors: [{ code: "list_failed", message: listed.error }] },
      { status: 502 },
    );
  }
  return NextResponse.json({ status: "ok", users: listed.users });
}

export async function POST(request: NextRequest) {
  const gate = await requireActiveUser(request);
  if ("error" in gate && gate.error) return gate.error;

  let body: { network_id?: string; display_name?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { status: "error", errors: [{ code: "invalid_json", message: "Invalid JSON body." }] },
      { status: 400 },
    );
  }

  const result = await addActiveAccessUser({
    networkId: String(body.network_id ?? ""),
    displayName: body.display_name,
    addedBy: gate.user!.networkId,
  });
  if (!result.ok) {
    const status =
      result.code === "already_exists"
        ? 409
        : result.code === "invalid_network_id"
          ? 400
          : result.code === "developer_protected" || result.code === "tier_not_allowed"
            ? 403
            : 502;
    return NextResponse.json(
      {
        status: "error",
        errors: [{ code: result.code ?? "add_failed", message: result.error }],
      },
      { status },
    );
  }
  return NextResponse.json({ status: "ok" }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireActiveUser(request);
  if ("error" in gate && gate.error) return gate.error;

  const { searchParams } = new URL(request.url);
  const networkId = searchParams.get("network_id") ?? "";
  const result = await removeActiveAccessUser(networkId);
  if (!result.ok) {
    const status =
      result.code === "not_found"
        ? 404
        : result.code === "last_active_user" || result.code === "invalid_network_id"
          ? 400
          : result.code === "developer_protected"
            ? 403
            : 502;
    return NextResponse.json(
      {
        status: "error",
        errors: [{ code: result.code ?? "remove_failed", message: result.error }],
      },
      { status },
    );
  }
  return NextResponse.json({ status: "ok", removed: networkId.trim().toLowerCase() });
}

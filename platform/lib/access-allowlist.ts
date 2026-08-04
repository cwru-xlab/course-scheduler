/**
 * Server-side caseID allowlist checks against the solver Postgres-backed API.
 * Results are cached briefly so middleware does not hit the solver on every request.
 */

import { fetchSolver } from "@/lib/api/solverFetch";

export type AccessTier = "active" | "developer";

export type AccessCheckResult = {
  allowed: boolean;
  tier: AccessTier | null;
};

const CACHE_TTL_MS = 45_000;

type CacheEntry = {
  result: AccessCheckResult;
  expiresAt: number;
};

const checkCache = new Map<string, CacheEntry>();

function accessHeaders(): HeadersInit {
  const key = (process.env.SOLVER_ACCESS_KEY || "").trim();
  if (!key) return {};
  return { "X-Solver-Access-Key": key };
}

export function invalidateAccessCheckCache(networkId?: string) {
  if (!networkId) {
    checkCache.clear();
    return;
  }
  checkCache.delete(networkId.trim().toLowerCase());
}

/**
 * Localhost non-production dev sessions bypass the allowlist.
 * Production always checks (or fails closed if the solver is unreachable).
 */
export function shouldBypassAllowlist(authProvider: string): boolean {
  return (
    authProvider === "dev" &&
    process.env.NODE_ENV !== "production"
  );
}

export async function checkAccessAllowlist(
  networkId: string,
  options?: { skipCache?: boolean },
): Promise<AccessCheckResult> {
  const id = networkId.trim().toLowerCase();
  if (!id) return { allowed: false, tier: null };

  if (!options?.skipCache) {
    const cached = checkCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
  }

  try {
    const { response, data } = await fetchSolver(
      `/access/check?network_id=${encodeURIComponent(id)}`,
      {
        method: "GET",
        headers: accessHeaders(),
        cache: "no-store",
      },
      { timeoutMs: 8_000 },
    );

    if (!response.ok) {
      // Fail closed in production; fail open only when the access API is missing
      // in local/dev so work can continue before the table is seeded.
      if (process.env.NODE_ENV !== "production" && response.status === 404) {
        const result: AccessCheckResult = { allowed: true, tier: "active" };
        checkCache.set(id, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }
      return { allowed: false, tier: null };
    }

    const allowed = data.allowed === true;
    const tierRaw = typeof data.tier === "string" ? data.tier : null;
    const tier: AccessTier | null =
      tierRaw === "active" || tierRaw === "developer" ? tierRaw : null;
    const result: AccessCheckResult = {
      allowed: allowed && tier != null,
      tier: allowed ? tier : null,
    };
    checkCache.set(id, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch {
    if (process.env.NODE_ENV !== "production") {
      // Local solver down — don't lock out SSO testing mid-dev.
      return { allowed: true, tier: "active" };
    }
    return { allowed: false, tier: null };
  }
}

export async function listActiveAccessUsers(): Promise<{
  ok: boolean;
  users: Array<{
    network_id: string;
    access_tier: string;
    display_name: string | null;
    added_by: string | null;
    created_at: string | null;
    updated_at: string | null;
  }>;
  error?: string;
}> {
  try {
    const { response, data } = await fetchSolver(
      "/access/users",
      { method: "GET", headers: accessHeaders(), cache: "no-store" },
      { timeoutMs: 10_000 },
    );
    if (!response.ok || data.status === "error") {
      return { ok: false, users: [], error: "Failed to load allowlist." };
    }
    const users = Array.isArray(data.users) ? (data.users as Array<Record<string, unknown>>) : [];
    return {
      ok: true,
      users: users.map((u) => ({
        network_id: String(u.network_id ?? ""),
        access_tier: String(u.access_tier ?? "active"),
        display_name: typeof u.display_name === "string" ? u.display_name : null,
        added_by: typeof u.added_by === "string" ? u.added_by : null,
        created_at: typeof u.created_at === "string" ? u.created_at : null,
        updated_at: typeof u.updated_at === "string" ? u.updated_at : null,
      })),
    };
  } catch {
    return { ok: false, users: [], error: "Failed to reach access service." };
  }
}

export async function addActiveAccessUser(input: {
  networkId: string;
  displayName?: string;
  addedBy?: string;
}): Promise<{ ok: boolean; error?: string; code?: string }> {
  try {
    const { response, data } = await fetchSolver(
      "/access/users",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...accessHeaders(),
        },
        body: JSON.stringify({
          network_id: input.networkId,
          display_name: input.displayName,
          added_by: input.addedBy,
          access_tier: "active",
        }),
      },
      { timeoutMs: 10_000 },
    );
    if (response.ok && data.status === "ok") {
      invalidateAccessCheckCache(input.networkId);
      return { ok: true };
    }
    const first = Array.isArray(data.errors) ? data.errors[0] : null;
    return {
      ok: false,
      code: typeof first?.code === "string" ? first.code : undefined,
      error:
        typeof first?.message === "string"
          ? first.message
          : "Could not add caseID.",
    };
  } catch {
    return { ok: false, error: "Failed to reach access service." };
  }
}

export async function removeActiveAccessUser(
  networkId: string,
): Promise<{ ok: boolean; error?: string; code?: string }> {
  try {
    const { response, data } = await fetchSolver(
      `/access/users/${encodeURIComponent(networkId.trim().toLowerCase())}`,
      {
        method: "DELETE",
        headers: accessHeaders(),
      },
      { timeoutMs: 10_000 },
    );
    if (response.ok && data.status === "ok") {
      invalidateAccessCheckCache(networkId);
      return { ok: true };
    }
    const first = Array.isArray(data.errors) ? data.errors[0] : null;
    return {
      ok: false,
      code: typeof first?.code === "string" ? first.code : undefined,
      error:
        typeof first?.message === "string"
          ? first.message
          : "Could not remove caseID.",
    };
  } catch {
    return { ok: false, error: "Failed to reach access service." };
  }
}

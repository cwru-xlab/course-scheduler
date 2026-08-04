"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Shield, Trash2, UserPlus } from "lucide-react";

import { useAuth } from "@/lib/auth-client";

type AccessUserRow = {
  network_id: string;
  access_tier: string;
  display_name: string | null;
  added_by: string | null;
  created_at: string | null;
};

export default function ManageAccessPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<AccessUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [networkId, setNetworkId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const canManage =
    user?.authProvider === "dev" || user?.accessTier === "active";

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/access/users", { cache: "no-store" });
      if (res.status === 403) {
        setError("Only active users can manage access.");
        setUsers([]);
        return;
      }
      if (!res.ok) {
        setError("Failed to load allowlist.");
        setUsers([]);
        return;
      }
      const data = (await res.json()) as { users?: AccessUserRow[] };
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch {
      setError("Failed to load allowlist.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!canManage) {
      setLoading(false);
      setError("Only active users can manage access.");
      return;
    }
    void loadUsers();
  }, [authLoading, user, canManage, loadUsers, router]);

  const handleAdd = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/access/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network_id: networkId.trim().toLowerCase(),
          display_name: displayName.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        errors?: Array<{ message?: string }>;
      };
      if (!res.ok) {
        setError(data.errors?.[0]?.message ?? "Could not add caseID.");
        return;
      }
      setNetworkId("");
      setDisplayName("");
      await loadUsers();
    } catch {
      setError("Could not add caseID.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (
      !window.confirm(
        `Remove ${id} from the allowlist? They will lose access on their next request.`,
      )
    ) {
      return;
    }
    setRemovingId(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/access/users?network_id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as {
        errors?: Array<{ message?: string }>;
      };
      if (!res.ok) {
        setError(data.errors?.[0]?.message ?? "Could not remove caseID.");
        return;
      }
      await loadUsers();
    } catch {
      setError("Could not remove caseID.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <Shield className="size-6 text-weatherhead-primary" aria-hidden />
          Manage access
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Only CWRU caseIDs on this active list can sign in with SSO. Developer
          accounts are managed separately by engineering and do not appear here.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </div>
      ) : null}

      {!canManage && !authLoading ? (
        <p className="text-sm text-slate-600">
          You do not have permission to manage access.
        </p>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <UserPlus className="size-4" aria-hidden />
              Add caseID
            </h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                label="CaseID"
                placeholder="abc123"
                value={networkId}
                onValueChange={setNetworkId}
                className="flex-1"
                description="Lowercase CWRU network ID (letters and digits)"
              />
              <Input
                label="Display name (optional)"
                placeholder="Jane Doe"
                value={displayName}
                onValueChange={setDisplayName}
                className="flex-1"
              />
            </div>
            <Button
              color="primary"
              className="font-semibold"
              isLoading={saving}
              isDisabled={!networkId.trim() || saving}
              onPress={() => void handleAdd()}
            >
              Add to allowlist
            </Button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-800">
                Active users ({users.length})
              </h2>
            </div>
            {loading ? (
              <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>
            ) : users.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                No active users yet. Add at least one caseID before enabling the
                gate in production.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {users.map((row) => (
                  <li
                    key={row.network_id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {row.network_id}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {row.display_name || "—"}
                        {row.added_by ? ` · added by ${row.added_by}` : ""}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="light"
                      color="danger"
                      isIconOnly
                      aria-label={`Remove ${row.network_id}`}
                      isLoading={removingId === row.network_id}
                      isDisabled={removingId != null}
                      onPress={() => void handleRemove(row.network_id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

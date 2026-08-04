"use client";

import { useEffect, useState } from "react";

/**
 * Polls GET /api/solver-lock for a best-effort shared "solver running" signal.
 * On multi-instance hosts (e.g. Vercel) this may miss runs on other instances —
 * local progress for the initiator does not depend on this.
 */
export type SolverLockStatus = {
  active: boolean;
  startedBy: string | null;
  startedByNetworkId: string | null;
  startedAt: number | null;
};

const POLL_MS = 4000;

export const useSolverLock = (): SolverLockStatus => {
  const [state, setState] = useState<SolverLockStatus>({
    active: false,
    startedBy: null,
    startedByNetworkId: null,
    startedAt: null,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const pull = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/solver-lock", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as Partial<SolverLockStatus> & { active?: boolean };
        if (cancelled) return;
        const normalized: SolverLockStatus = {
          active: Boolean(next.active),
          startedBy: next.startedBy ?? null,
          startedByNetworkId: next.startedByNetworkId ?? null,
          startedAt: typeof next.startedAt === "number" ? next.startedAt : null,
        };
        setState((prev) =>
          prev.active === normalized.active &&
          prev.startedBy === normalized.startedBy &&
          prev.startedByNetworkId === normalized.startedByNetworkId &&
          prev.startedAt === normalized.startedAt
            ? prev
            : normalized,
        );
      } catch {
        // silent
      }
    };

    void pull();
    const interval = window.setInterval(pull, POLL_MS);
    const handleVisibility = () => {
      if (!document.hidden) void pull();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return state;
};

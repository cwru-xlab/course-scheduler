"use client";

import { useEffect, useState } from "react";

export type SolverLockStatus = {
  active: boolean;
  startedBy: string | null;
  startedAt: number | null;
};

const POLL_MS = 4000;

export const useSolverLock = (): SolverLockStatus => {
  const [state, setState] = useState<SolverLockStatus>({
    active: false,
    startedBy: null,
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
        const next = (await res.json()) as SolverLockStatus;
        if (cancelled) return;
        setState((prev) =>
          prev.active === next.active &&
          prev.startedBy === next.startedBy &&
          prev.startedAt === next.startedAt
            ? prev
            : next,
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

"use client";

import { useCallback, useEffect, useState } from "react";

export type SolverLockStatus = {
  active: boolean;
  startedBy: string | null;
  startedByNetworkId: string | null;
  startedAt: number | null;
  progress: number;
  cancelled: boolean;
};

const POLL_MS = 4000;

export const useSolverLock = (): SolverLockStatus & {
  updateProgress: (progress: number) => Promise<void>;
  cancelRun: () => Promise<boolean>;
} => {
  const [state, setState] = useState<SolverLockStatus>({
    active: false,
    startedBy: null,
    startedByNetworkId: null,
    startedAt: null,
    progress: 0,
    cancelled: false,
  });

  const updateProgress = useCallback(async (progress: number) => {
    try {
      const res = await fetch("/api/solver-lock", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress }),
      });
      if (res.ok) {
        const next = (await res.json()) as SolverLockStatus;
        setState(next);
      }
    } catch {
      // silent
    }
  }, []);

  const cancelRun = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/solver-lock", { method: "DELETE" });
      if (res.ok) {
        const data = (await res.json()) as { cancelled?: boolean };
        return data.cancelled === true;
      }
    } catch {
      // silent
    }
    return false;
  }, []);

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
          prev.startedByNetworkId === next.startedByNetworkId &&
          prev.startedAt === next.startedAt &&
          prev.progress === next.progress &&
          prev.cancelled === next.cancelled
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

  return { ...state, updateProgress, cancelRun };
};

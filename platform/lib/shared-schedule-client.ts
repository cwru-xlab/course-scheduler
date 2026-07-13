"use client";

import { useEffect, useState } from "react";

export type SharedScheduleMeta = {
  revision: number;
  ranBy: string | null;
  ranAt: number | null;
};

export type SharedScheduleSnapshot = {
  input: unknown;
  solution: unknown;
  lockedSectionIds: string[];
  createdAt: string;
};

export type SharedScheduleFull = SharedScheduleMeta & {
  snapshot: SharedScheduleSnapshot | null;
};

const POLL_MS = 4000;

/** Fetch the full shared-schedule snapshot payload on demand. */
export async function fetchSharedScheduleFull(): Promise<SharedScheduleFull | null> {
  try {
    const res = await fetch("/api/shared-schedule?full=1", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SharedScheduleFull;
  } catch {
    return null;
  }
}

/** Poll cheap shared-schedule metadata so the UI can react to new runs. */
export const useSharedScheduleMeta = (): SharedScheduleMeta => {
  const [state, setState] = useState<SharedScheduleMeta>({
    revision: 0,
    ranBy: null,
    ranAt: null,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const pull = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/shared-schedule", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as SharedScheduleMeta;
        if (cancelled) return;
        setState((prev) =>
          prev.revision === next.revision &&
          prev.ranBy === next.ranBy &&
          prev.ranAt === next.ranAt
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
